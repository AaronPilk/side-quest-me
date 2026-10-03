import AVFoundation
import Capacitor
import UIKit
import WebKit

/// Owns the iOS camera and recording session. JavaScript supplies controls and
/// persists each completed take before calling discardRecording. No WebRTC
/// camera session should run alongside this plugin.
/// Cross-thread access is explicitly isolated to sessionQueue or the main
/// queue; delegates never mutate session state directly.
@objc(SidequestCameraPlugin)
public final class SidequestCameraPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate, @unchecked Sendable {
    public let identifier = "SidequestCameraPlugin"
    public let jsName = "SidequestCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updatePreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTorch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverRecordings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearRecordings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private struct CameraFailure: Error {
        let code: String
        let message: String
    }
    private enum RecordingPhase { case idle, starting, recording, finishing }
    private struct StoredTake: Codable, Sendable {
        let version: Int
        let contextId: String
        let captureId: String
        let recordingId: String
        let startedAtMs: Double
    }
    private struct InspectedMovie: Sendable {
        let durationMs: Double
        let playable: Bool
    }
    private struct RecoveredTake: Sendable {
        let url: URL
        let metadata: StoredTake
        let durationMs: Double
    }

    // All session, device, promise and recording state below belongs to this queue.
    private let sessionQueue = DispatchQueue(label: "app.sidequest.camera", qos: .userInitiated)
    private let session = AVCaptureSession()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var configured = false
    private var previewAttached = false
    private var previewReady = false
    private var authorized = false
    private var wantsCamera = false
    private var foreground = true
    private var captureInterrupted = false
    private var audioInterrupted = false
    private var interruptionNotified = false
    private var generation = 0
    private var captureId: String?
    private var contextId: String?
    private var pendingReadyCall: CAPPluginCall?
    private var closeCalls: [CAPPluginCall] = []
    private var recordingPhase: RecordingPhase = .idle
    private var recordingURL: URL?
    private var recordingMetadata: StoredTake?
    private var issuedRecordingIds = Set<String>()
    private var recordingStartCall: CAPPluginCall?
    private var recordingStopCalls: [CAPPluginCall] = []
    private var recordingWasInterrupted = false
    private var requestedRecordingStop = false
    private var recordingFinishTimedOut = false
    private var recordingFinishDeadlineScheduled = false
    private var recordingFileClosed = false
    private var clearingRecordings = false
    private var clearCalls: [CAPPluginCall] = []
    private var lastRecording: [String: Any]?
    private var issuedFiles = Set<URL>()
    private var discardedFiles = Set<URL>()
    private var pendingRecoveries: [UUID: CAPPluginCall] = [:]
    private let recordingsDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("SidequestCamera", isDirectory: true)
    private var observers: [NSObjectProtocol] = []

    // UIKit, WebView appearance and preview-layer presentation are main-thread only.
    private var previewView: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var previewGeneration = 0
    private var previewAttempt = 0
    private var savedWebAppearance: (opaque: Bool, background: UIColor?, scrollBackground: UIColor?)?
    private var finishingTask: UIBackgroundTaskIdentifier = .invalid

    public override func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.foreground = false
                self.interrupt(reason: "inactive")
            }
        })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.foreground = false
                if self.pendingReadyCall != nil {
                    // An unfulfilled start/flip must not silently start hardware
                    // later after its caller has already received a rejection.
                    self.failCamera(CameraFailure(code: "camera_background", message: "Return to Sidequest to start the camera."))
                    return
                }
                self.interrupt(reason: "background")
            }
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.foreground = true
                self.resumeIfPossible()
            }
        })
        observers.append(center.addObserver(forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil) { [weak self] notification in
            let reason = (notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber)?.intValue
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.captureInterrupted = true
                self.interrupt(reason: "capture-session", detail: reason)
            }
        })
        observers.append(center.addObserver(forName: AVCaptureSession.interruptionEndedNotification, object: session, queue: nil) { [weak self] _ in
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.captureInterrupted = false
                self.resumeIfPossible()
            }
        })
        observers.append(center.addObserver(forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil) { [weak self] _ in
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.failCamera(CameraFailure(code: "camera_runtime_error", message: "The camera was interrupted. Your completed takes are kept. Restart the camera to continue."))
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(), queue: nil) { [weak self] notification in
            let began = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue
            self?.sessionQueue.async { [weak self] in
                guard let self else { return }
                self.audioInterrupted = began
                if began { self.interrupt(reason: "audio-session") }
                else { self.resumeIfPossible() }
            }
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        let captureSession = session
        let output = movieOutput
        sessionQueue.async {
            if output.isRecording { output.stopRecording() }
            if captureSession.isRunning { captureSession.stopRunning() }
        }
    }

    @objc public func start(_ call: CAPPluginCall) {
        #if targetEnvironment(simulator)
        call.reject("The iOS Simulator has no camera. Import a video or test recording on an iPhone.", "camera_simulator")
        return
        #else
        guard let frame = Self.previewFrame(call), let position = Self.position(call.getString("position") ?? "back"), let captureId = Self.validIdentifier(call.getString("captureId")), let contextId = Self.validContext(call.getString("contextId")) else {
            call.reject("Provide a valid camera session, position and preview rectangle.", "camera_invalid_arguments")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let isActive = UIApplication.shared.applicationState == .active
            self.sessionQueue.async {
                guard isActive else { self.reject(call, "Return to Sidequest to start the camera.", "camera_background"); return }
                guard !self.wantsCamera, !self.clearingRecordings, self.pendingReadyCall == nil, self.recordingPhase == .idle, self.closeCalls.isEmpty else {
                    self.reject(call, "The camera is busy. Wait for it to finish before reopening.", "camera_busy")
                    return
                }
                do { try self.applyPendingClear() }
                catch { self.reject(call, "Previous signed-out recordings could not be cleared. Try again.", "camera_cleanup_failed"); return }
                self.generation += 1
                let token = self.generation
                self.captureId = captureId
                self.contextId = contextId
                self.foreground = true
                self.wantsCamera = true
                self.authorized = false
                self.captureInterrupted = false
                self.audioInterrupted = false
                self.pendingReadyCall = call
                DispatchQueue.main.async {
                    Self.requestMediaPermissions { [weak self] result in
                        self?.sessionQueue.async { [weak self] in
                            guard let self, self.generation == token, self.wantsCamera else { return }
                            switch result {
                            case .failure(let failure): self.failCamera(failure)
                            case .success:
                                do {
                                    try self.configure(position: position)
                                    self.authorized = true
                                    self.attachPreview(frame: frame, token: token, position: position)
                                } catch let failure as CameraFailure { self.failCamera(failure) }
                                catch { self.failCamera(CameraFailure(code: "camera_setup_failed", message: "The camera could not start. Restart it or import a video.")) }
                            }
                        }
                    }
                }
            }
        }
        #endif
    }

    @objc public func updatePreview(_ call: CAPPluginCall) {
        guard let frame = Self.previewFrame(call) else { call.reject("Provide a valid preview rectangle.", "camera_invalid_arguments"); return }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.wantsCamera, self.previewAttached else { self.reject(call, "Start the camera first.", "camera_not_ready"); return }
            let token = self.generation
            DispatchQueue.main.async {
                guard self.previewGeneration == token, self.positionPreview(frame) else { call.reject("The camera preview is unavailable.", "camera_preview_unavailable"); return }
                call.resolve()
            }
        }
    }

    @objc public func setZoom(_ call: CAPPluginCall) {
        guard let value = call.getDouble("zoom"), value.isFinite, value > 0 else { call.reject("Choose a valid zoom value.", "camera_invalid_zoom"); return }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.previewReady, self.wantsCamera, let device = self.videoInput?.device else { self.reject(call, "Start the camera first.", "camera_not_ready"); return }
            do {
                try self.applyZoom(value, to: device)
                self.resolve(call, self.cameraState())
            } catch { self.reject(call, "Zoom is unavailable right now. Try again.", "camera_zoom_unavailable") }
        }
    }

    @objc public func flip(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.wantsCamera, self.previewReady, self.pendingReadyCall == nil, self.recordingPhase == .idle, let oldInput = self.videoInput else {
                self.reject(call, "Pause recording and wait for the camera before flipping.", "camera_busy")
                return
            }
            let position: AVCaptureDevice.Position = oldInput.device.position == .back ? .front : .back
            guard let device = Self.camera(position: position) else { self.reject(call, "That camera is unavailable on this device.", "camera_unavailable"); return }
            self.generation += 1
            let token = self.generation
            self.previewReady = false
            self.pendingReadyCall = call
            DispatchQueue.main.async {
                self.previewGeneration = token
                self.previewLayer?.connection?.isEnabled = false
                self.sessionQueue.async {
                    guard self.generation == token, self.wantsCamera else { return }
                    do {
                        let replacement = try AVCaptureDeviceInput(device: device)
                        self.turnOffTorch()
                        self.session.beginConfiguration()
                        self.session.removeInput(oldInput)
                        guard self.session.canAddInput(replacement) else {
                            self.session.addInput(oldInput)
                            self.session.commitConfiguration()
                            throw CameraFailure(code: "camera_unavailable", message: "That camera could not start. Restart the camera.")
                        }
                        self.session.addInput(replacement)
                        self.videoInput = replacement
                        self.session.commitConfiguration()
                        try self.applyZoom(1, to: device)
                        self.configureMovieConnection(position: position)
                        DispatchQueue.main.async {
                            guard self.previewGeneration == token else { return }
                            Self.configureConnection(self.previewLayer?.connection, position: position)
                            self.previewLayer?.connection?.isEnabled = true
                            self.sessionQueue.async { self.resumeIfPossible() }
                        }
                    } catch let failure as CameraFailure { self.failCamera(failure) }
                    catch { self.failCamera(CameraFailure(code: "camera_flip_failed", message: "The other camera could not start. Restart the camera.")) }
                }
            }
        }
    }

    @objc public func setTorch(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else { call.reject("Choose whether the light should be on.", "camera_invalid_arguments"); return }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.wantsCamera, self.previewReady, let device = self.videoInput?.device, device.hasTorch, device.isTorchAvailable, device.isTorchModeSupported(enabled ? .on : .off) else {
                self.reject(call, "The light is unavailable on this camera.", "camera_torch_unavailable")
                return
            }
            do {
                try device.lockForConfiguration()
                defer { device.unlockForConfiguration() }
                device.torchMode = enabled ? .on : .off
                self.resolve(call, self.cameraState())
            } catch { self.reject(call, "The light is unavailable right now.", "camera_torch_unavailable") }
        }
    }

    @objc public func startRecording(_ call: CAPPluginCall) {
        guard let recordingId = Self.validIdentifier(call.getString("recordingId")) else {
            call.reject("Provide a valid recording identifier.", "camera_invalid_arguments")
            return
        }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.wantsCamera, self.foreground, self.previewReady, self.session.isRunning, !self.session.isInterrupted, self.recordingPhase == .idle, let captureId = self.captureId, let contextId = self.contextId else {
                self.reject(call, "Wait for the live camera preview before recording.", "camera_not_ready")
                return
            }
            guard !self.issuedRecordingIds.contains(recordingId) else {
                self.reject(call, "Use a new identifier for each recording.", "camera_invalid_arguments")
                return
            }
            do {
                try FileManager.default.createDirectory(at: self.recordingsDirectory, withIntermediateDirectories: true)
                var directory = self.recordingsDirectory
                var directoryValues = URLResourceValues()
                directoryValues.isExcludedFromBackup = true
                try directory.setResourceValues(directoryValues)
                let url = self.recordingsDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("mov")
                let metadata = StoredTake(version: 1, contextId: contextId, captureId: captureId, recordingId: recordingId, startedAtMs: Date().timeIntervalSince1970 * 1_000)
                // Durable attribution precedes capture, so even an app restart
                // can recover a playable file without crossing owner/run scope.
                try JSONEncoder().encode(metadata).write(to: Self.sidecar(for: url), options: .atomic)
                self.recordingURL = url
                self.recordingMetadata = metadata
                self.issuedRecordingIds.insert(recordingId)
                self.issuedFiles.insert(url.standardizedFileURL)
                self.lastRecording = nil
                self.recordingPhase = .starting
                self.recordingStartCall = call
                self.recordingWasInterrupted = false
                self.requestedRecordingStop = false
                self.recordingFinishTimedOut = false
                self.recordingFinishDeadlineScheduled = false
                self.recordingFileClosed = false
                self.movieOutput.startRecording(to: url, recordingDelegate: self)
                self.sessionQueue.asyncAfter(deadline: .now() + 5) { [weak self] in
                    guard let self, self.recordingURL == url, self.recordingPhase == .starting else { return }
                    self.rejectStartRecording("Recording did not start. Your earlier takes are kept.", "camera_recording_start_timeout")
                    self.requestRecordingStop(interrupted: true)
                }
            } catch { self.reject(call, "The recording file could not be created. Free some space and try again.", "camera_storage_unavailable") }
        }
    }

    @objc public func stopRecording(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard !self.clearingRecordings else { self.reject(call, "Signed-out recordings are being cleared.", "camera_cleared"); return }
            if self.recordingPhase == .idle {
                if let result = self.lastRecording { self.resolve(call, result) }
                else { self.reject(call, "There is no recorded take to save.", "camera_no_recording") }
                return
            }
            self.recordingStopCalls.append(call)
            self.requestRecordingStop(interrupted: false)
        }
    }

    /// Recovers only this owner/run's finalized files. A file currently being
    /// recorded or closed is never offered to JavaScript prematurely.
    @objc public func recoverRecordings(_ call: CAPPluginCall) {
        guard let contextId = Self.validContext(call.getString("contextId")) else {
            call.reject("Provide a valid quest recording context.", "camera_invalid_arguments")
            return
        }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard !self.clearingRecordings else { self.resolve(call, ["takes": []]); return }
            do { try self.applyPendingClear() }
            catch { self.reject(call, "Previous signed-out recordings could not be cleared. Try again.", "camera_cleanup_failed"); return }
            let requestId = UUID()
            let directory = self.recordingsDirectory
            let unfinished = self.recordingURL
            self.pendingRecoveries[requestId] = call
            self.sessionQueue.asyncAfter(deadline: .now() + 15) { [weak self] in
                guard let self, let call = self.pendingRecoveries.removeValue(forKey: requestId) else { return }
                self.reject(call, "Saved takes are still being checked. They are kept; try again.", "camera_recovery_timeout")
            }
            Task { [weak self] in
                var recovered: [RecoveredTake] = []
                let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey])) ?? []
                for url in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
                    guard url.pathExtension == "mov", Self.validIdentifier(url.deletingPathExtension().lastPathComponent) != nil, url != unfinished,
                          let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]), values.isRegularFile == true, values.isSymbolicLink != true,
                          let metadata = Self.readMetadata(for: url), metadata.contextId == contextId else { continue }
                    if Date().timeIntervalSince1970 * 1_000 - metadata.startedAtMs >= 7 * 24 * 60 * 60 * 1_000 {
                        // Match the existing seven-day device-draft lifetime.
                        // Both the movie and sidecar have been validated above.
                        try? FileManager.default.removeItem(at: url)
                        try? FileManager.default.removeItem(at: Self.sidecar(for: url))
                        continue
                    }
                    let movie = await Self.inspectMovie(url)
                    if movie.playable { recovered.append(RecoveredTake(url: url, metadata: metadata, durationMs: movie.durationMs)) }
                }
                let completed = recovered.sorted {
                    if $0.metadata.startedAtMs != $1.metadata.startedAtMs { return $0.metadata.startedAtMs < $1.metadata.startedAtMs }
                    return $0.metadata.recordingId < $1.metadata.recordingId
                }
                self?.sessionQueue.async { [weak self] in
                    guard let self, let call = self.pendingRecoveries.removeValue(forKey: requestId) else { return }
                    let takes = completed.filter { $0.url != self.recordingURL && !self.discardedFiles.contains($0.url.standardizedFileURL) }.map { item -> [String: Any] in
                        self.issuedFiles.insert(item.url.standardizedFileURL)
                        self.issuedRecordingIds.insert(item.metadata.recordingId)
                        return Self.takeResult(url: item.url, durationMs: item.durationMs, metadata: item.metadata, interrupted: true, recovered: true)
                    }
                    self.resolve(call, ["takes": takes])
                }
            }
        }
    }

    /// Deletes only a file issued by this plugin, after JS has persisted its Blob.
    @objc public func discardRecording(_ call: CAPPluginCall) {
        guard let path = call.getString("fileUrl"), let parsed = URL(string: path), parsed.isFileURL, parsed.query == nil, parsed.fragment == nil, parsed.host == nil || parsed.host == "" else {
            call.reject("Choose a recording created by Sidequest.", "camera_invalid_file")
            return
        }
        let url = parsed.standardizedFileURL
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.issuedFiles.contains(url), url.deletingLastPathComponent() == self.recordingsDirectory.standardizedFileURL, self.recordingURL?.standardizedFileURL != url else {
                self.reject(call, "Only a completed Sidequest camera take can be removed.", "camera_invalid_file")
                return
            }
            if self.discardedFiles.contains(url) { self.resolve(call); return }
            do {
                if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
                let sidecar = Self.sidecar(for: url)
                if FileManager.default.fileExists(atPath: sidecar.path) { try FileManager.default.removeItem(at: sidecar) }
                self.discardedFiles.insert(url)
                if self.lastRecording?["fileUrl"] as? String == parsed.absoluteString { self.lastRecording = nil }
                self.resolve(call)
            } catch { self.reject(call, "The temporary recording could not be removed.", "camera_file_cleanup_failed") }
        }
    }

    /// Explicit sign-out/persona cleanup, distinct from ordinary camera close.
    @objc public func clearRecordings(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.clearingRecordings {
                self.clearCalls.append(call)
                if self.recordingPhase == .idle || self.recordingFileClosed { self.finishClearingRecordings() }
                else if self.recordingFinishTimedOut { self.rejectClearWaiters() }
                return
            }
            do {
                let marker = self.clearMarker
                try FileManager.default.createDirectory(at: marker.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data([1]).write(to: marker, options: .atomic)
                var excludedMarker = marker
                var values = URLResourceValues()
                values.isExcludedFromBackup = true
                try excludedMarker.setResourceValues(values)
            } catch {
                self.failCamera(CameraFailure(code: "camera_cleanup_failed", message: "Saved recordings could not be cleared. Try device cleanup again."))
                self.reject(call, "Saved recordings could not be cleared. Try device cleanup again.", "camera_cleanup_failed")
                return
            }
            self.clearingRecordings = true
            self.clearCalls.append(call)
            self.wantsCamera = false
            self.previewReady = false
            self.generation += 1
            self.cancelReady(code: "camera_cleared", message: "Signed-out camera recordings were cleared.")
            let recovering = Array(self.pendingRecoveries.values)
            self.pendingRecoveries.removeAll()
            recovering.forEach { self.reject($0, "Signed-out recordings are being cleared.", "camera_cleared") }
            if self.recordingPhase == .idle || self.recordingFileClosed { self.finishClearingRecordings() }
            else { self.requestRecordingStop(interrupted: true) }
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.closeCalls.append(call)
            self.wantsCamera = false
            self.generation += 1
            self.previewReady = false
            self.cancelReady(code: "camera_closed", message: "The camera was closed.")
            if self.recordingPhase != .idle { self.requestRecordingStop(interrupted: false) }
            else { self.teardown() }
        }
    }

    public func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo fileURL: URL, from connections: [AVCaptureConnection]) {
        sessionQueue.async { [weak self] in
            guard let self, self.recordingURL == fileURL else { return }
            if self.recordingPhase == .starting {
                self.recordingPhase = .recording
            }
            // A stop/interruption may have arrived before this callback. The
            // callback still proves capture began, without reverting finishing.
            if let call = self.recordingStartCall { self.recordingStartCall = nil; self.resolve(call) }
            if self.requestedRecordingStop { self.movieOutput.stopRecording() }
        }
    }

    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo fileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        // File data is safe to consume only after this delegate callback, never
        // when stopRecording() itself returns. Validate metadata off the main thread.
        sessionQueue.async { [weak self] in
            guard let self, self.recordingURL == fileURL else { return }
            self.recordingFileClosed = true
            if self.clearingRecordings { self.finishClearingRecordings(); return }
            self.recordingPhase = .finishing
            self.beginFinishingTask()
            self.ensureFinishingDeadline(url: fileURL)
            let captureError = error as NSError?
            let reportedSuccessful = error == nil || (captureError?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? NSNumber)?.boolValue == true
            let normalLimit = captureError?.domain == AVFoundationErrorDomain &&
                (captureError?.code == AVError.maximumDurationReached.rawValue || captureError?.code == AVError.maximumFileSizeReached.rawValue)
            let interrupted = self.recordingWasInterrupted || (error != nil && !normalLimit)
            Task { [weak self] in
                // A verified playable file is retained even when interruption
                // reports an error without the successfully-finished flag.
                let movie = await Self.inspectMovie(fileURL)
                self?.sessionQueue.async { [weak self] in
                    guard let self, self.recordingURL == fileURL else { return }
                    self.finishRecording(url: fileURL, durationMs: movie.durationMs, playable: movie.playable, interrupted: interrupted, reportedSuccessful: reportedSuccessful)
                }
            }
        }
    }

    private func configure(position: AVCaptureDevice.Position) throws {
        guard let camera = Self.camera(position: position) else { throw CameraFailure(code: "camera_unavailable", message: "No camera is available. Import a video or test on an iPhone.") }
        guard let microphone = AVCaptureDevice.default(for: .audio) else { throw CameraFailure(code: "camera_microphone_unavailable", message: "The microphone is unavailable. Restart the camera or import a video.") }
        let video = try AVCaptureDeviceInput(device: camera)
        let audio = try AVCaptureDeviceInput(device: microphone)
        session.beginConfiguration()
        session.sessionPreset = session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high
        guard session.canAddInput(video), session.canAddInput(audio), session.canAddOutput(movieOutput) else {
            session.commitConfiguration()
            throw CameraFailure(code: "camera_setup_failed", message: "Camera and microphone recording are unavailable right now.")
        }
        session.addInput(video)
        session.addInput(audio)
        session.addOutput(movieOutput)
        videoInput = video
        audioInput = audio
        configured = true
        movieOutput.maxRecordedDuration = CMTime(seconds: 60, preferredTimescale: 600)
        movieOutput.maxRecordedFileSize = 40 * 1024 * 1024
        movieOutput.minFreeDiskSpaceLimit = 50 * 1024 * 1024
        // Periodic fragments help preserve data while an interrupted file closes.
        movieOutput.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
        // Commit the preset and inputs before reading the active zoom range or
        // configuring the output connection and its supported codec settings.
        session.commitConfiguration()
        try applyZoom(1, to: camera)
        configureMovieConnection(position: position)
    }

    private func configureMovieConnection(position: AVCaptureDevice.Position) {
        guard let connection = movieOutput.connection(with: .video) else { return }
        Self.configureConnection(connection, position: position)
        let keys = movieOutput.supportedOutputSettingsKeys(for: connection)
        if keys.contains(AVVideoCodecKey), movieOutput.availableVideoCodecTypes.contains(.h264) {
            var settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264]
            if keys.contains(AVVideoCompressionPropertiesKey) {
                settings[AVVideoCompressionPropertiesKey] = [AVVideoAverageBitRateKey: 3_000_000]
            }
            movieOutput.setOutputSettings(settings, for: connection)
        }
    }

    private static func configureConnection(_ connection: AVCaptureConnection?, position: AVCaptureDevice.Position) {
        guard let connection else { return }
        // This app has a fixed portrait interface. Semantic orientation handles
        // camera-specific sensor mounting; a hard-coded 90° rotation does not.
        // The supported compatibility API also covers our iOS 15 deployment.
        if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
        if connection.isVideoMirroringSupported {
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = position == .front
        }
    }

    private static func camera(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        let types: [AVCaptureDevice.DeviceType] = position == .back
            ? [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]
            : [.builtInWideAngleCamera, .builtInTrueDepthCamera]
        for type in types {
            if let device = AVCaptureDevice.default(type, for: .video, position: position) { return device }
        }
        return nil
    }

    /// Display zoom is relative to the wide lens; raw hardware zoom is >= 1.
    private func displayMultiplier(_ device: AVCaptureDevice) -> CGFloat {
        if #available(iOS 18.0, *) {
            let multiplier = device.displayVideoZoomFactorMultiplier
            if multiplier.isFinite, multiplier > 0 { return multiplier }
        }
        let constituents = device.constituentDevices
        if let wide = constituents.firstIndex(where: { $0.deviceType == .builtInWideAngleCamera }), wide > 0, device.virtualDeviceSwitchOverVideoZoomFactors.count >= wide {
            let wideFactor = CGFloat(truncating: device.virtualDeviceSwitchOverVideoZoomFactors[wide - 1])
            if wideFactor.isFinite, wideFactor > 0 { return 1 / wideFactor }
        }
        return 1
    }

    private func applyZoom(_ displayed: Double, to device: AVCaptureDevice) throws {
        let multiplier = displayMultiplier(device)
        let minimum = max(1, device.minAvailableVideoZoomFactor)
        let maximum = max(minimum, min(device.maxAvailableVideoZoomFactor, device.activeFormat.videoMaxZoomFactor))
        let raw = min(max(CGFloat(displayed) / multiplier, minimum), maximum)
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.videoZoomFactor = raw
    }

    private func cameraState() -> [String: Any] {
        guard let device = videoInput?.device, let captureId else { return ["running": false] }
        let multiplier = displayMultiplier(device)
        let minimum = max(1, device.minAvailableVideoZoomFactor) * multiplier
        let maximum = min(device.maxAvailableVideoZoomFactor, device.activeFormat.videoMaxZoomFactor) * multiplier
        let hasUltraWide = device.deviceType == .builtInUltraWideCamera || device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
        let presets = [0.5, 1.0].filter { value in
            (value != 0.5 || hasUltraWide) && value >= Double(minimum) - 0.001 && value <= Double(maximum) + 0.001
        }
        return [
            "captureId": captureId,
            "position": device.position == .front ? "front" : "back",
            "zoom": Double(device.videoZoomFactor * multiplier),
            "minZoom": Double(minimum), "maxZoom": Double(maximum), "presets": presets,
            "torchAvailable": device.hasTorch && device.isTorchAvailable && device.isTorchModeSupported(.on),
            "torch": device.hasTorch && device.torchMode == .on,
            "canFlip": Self.camera(position: device.position == .front ? .back : .front) != nil,
            "running": session.isRunning && previewReady,
            "recording": recordingPhase == .recording
        ]
    }

    private func attachPreview(frame: CGRect, token: Int, position: AVCaptureDevice.Position) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let web = self.bridge?.webView, let parent = web.superview else {
                self?.sessionQueue.async { [weak self] in self?.failCamera(CameraFailure(code: "camera_preview_unavailable", message: "The camera preview could not be displayed. Restart the camera.")) }
                return
            }
            self.previewGeneration = token
            if self.savedWebAppearance == nil { self.savedWebAppearance = (web.isOpaque, web.backgroundColor, web.scrollView.backgroundColor) }
            web.isOpaque = false
            web.backgroundColor = .clear
            web.scrollView.backgroundColor = .clear
            let surface = UIView()
            surface.backgroundColor = .black
            surface.isUserInteractionEnabled = false
            surface.isAccessibilityElement = false
            surface.accessibilityElementsHidden = true
            surface.clipsToBounds = true
            let layer = AVCaptureVideoPreviewLayer(session: self.session)
            layer.videoGravity = .resizeAspectFill
            surface.layer.addSublayer(layer)
            parent.insertSubview(surface, belowSubview: web)
            self.previewView?.removeFromSuperview()
            self.previewView = surface
            self.previewLayer = layer
            guard self.positionPreview(frame) else {
                self.sessionQueue.async { self.failCamera(CameraFailure(code: "camera_preview_unavailable", message: "The camera preview has no visible area. Restart the camera.")) }
                return
            }
            Self.configureConnection(layer.connection, position: position)
            self.sessionQueue.async {
                guard self.generation == token, self.wantsCamera else { return }
                self.previewAttached = true
                self.resumeIfPossible()
            }
        }
    }

    private func positionPreview(_ frame: CGRect) -> Bool {
        guard let web = bridge?.webView, let parent = web.superview, let view = previewView, let layer = previewLayer else { return false }
        let visible = frame.intersection(web.bounds)
        guard !visible.isNull, visible.width > 0, visible.height > 0 else { return false }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        view.frame = web.convert(visible, to: parent)
        layer.frame = view.bounds
        CATransaction.commit()
        return true
    }

    private func resumeIfPossible() {
        guard wantsCamera, authorized, configured, previewAttached, foreground, !captureInterrupted, !audioInterrupted, recordingPhase != .finishing else { return }
        if !session.isRunning { session.startRunning() }
        guard session.isRunning else { failCamera(CameraFailure(code: "camera_start_failed", message: "The camera could not start. Restart it or import a video.")); return }
        let token = generation
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.previewAttempt += 1
            self.waitForPreview(token: token, attempt: self.previewAttempt, deadline: CACurrentMediaTime() + 8)
        }
    }

    private func waitForPreview(token: Int, attempt: Int, deadline: CFTimeInterval) {
        guard previewGeneration == token, previewAttempt == attempt, let layer = previewLayer else { return }
        if layer.isPreviewing, previewView?.window != nil, layer.bounds.width > 0, layer.bounds.height > 0 {
            sessionQueue.async { [weak self] in
                guard let self, self.generation == token, self.wantsCamera, self.foreground, self.session.isRunning, !self.captureInterrupted, !self.audioInterrupted else { return }
                self.previewReady = true
                self.interruptionNotified = false
                let state = self.cameraState()
                if let call = self.pendingReadyCall { self.pendingReadyCall = nil; self.resolve(call, state) }
                self.emit("cameraReady", state)
            }
        } else if CACurrentMediaTime() >= deadline {
            sessionQueue.async { [weak self] in
                guard let self, self.generation == token, self.wantsCamera else { return }
                self.failCamera(CameraFailure(code: "camera_preview_timeout", message: "The live camera preview did not start. Your earlier takes are kept. Restart the camera or import a video."))
            }
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in self?.waitForPreview(token: token, attempt: attempt, deadline: deadline) }
        }
    }

    private func interrupt(reason: String, detail: Int? = nil) {
        guard wantsCamera, configured else { return }
        previewReady = false
        DispatchQueue.main.async { [weak self] in self?.previewAttempt += 1 }
        if !interruptionNotified {
            interruptionNotified = true
            var payload: [String: Any] = ["reason": reason, "recording": recordingPhase != .idle]
            if let captureId { payload["captureId"] = captureId }
            if let recordingId = recordingMetadata?.recordingId { payload["recordingId"] = recordingId }
            if let detail { payload["detail"] = detail }
            emit("interrupted", payload)
        }
        if recordingPhase != .idle { requestRecordingStop(interrupted: true) }
        else if session.isRunning { session.stopRunning() }
        turnOffTorch()
    }

    private func requestRecordingStop(interrupted: Bool) {
        guard recordingPhase != .idle, let url = recordingURL else { return }
        recordingWasInterrupted = recordingWasInterrupted || interrupted
        requestedRecordingStop = true
        if recordingFinishTimedOut {
            // Keep accepting a late delegate/file, but do not leave a new
            // Stop/Exit promise waiting forever after the original deadline.
            rejectFinishingWaiters()
            if clearingRecordings { rejectClearWaiters() }
            return
        }
        if recordingPhase != .finishing {
            recordingPhase = .finishing
            beginFinishingTask()
            if movieOutput.isRecording { movieOutput.stopRecording() }
        }
        ensureFinishingDeadline(url: url)
    }

    private func ensureFinishingDeadline(url: URL) {
        guard !recordingFinishDeadlineScheduled else { return }
        recordingFinishDeadlineScheduled = true
        sessionQueue.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, self.recordingURL == url, self.recordingPhase == .finishing else { return }
            self.recordingFinishTimedOut = true
            self.rejectStartRecording("The recording did not finish starting.", "camera_recording_start_failed")
            self.rejectFinishingWaiters()
            if self.clearingRecordings {
                self.rejectClearWaiters()
                self.turnOffTorch()
                if self.session.isRunning { self.session.stopRunning() }
            }
            self.emit("cameraError", ["code": "camera_recording_finish_timeout", "message": "The recording is still finishing. Your earlier takes and its file are kept."])
            self.endFinishingTask()
        }
    }

    private func finishRecording(url: URL, durationMs: Double, playable: Bool, interrupted: Bool, reportedSuccessful: Bool) {
        if clearingRecordings { finishClearingRecordings(); return }
        let completedMetadata = recordingMetadata
        rejectStartRecording("Recording ended before it could start. Try another take.", "camera_recording_start_failed")
        recordingPhase = .idle
        recordingURL = nil
        requestedRecordingStop = false
        recordingFinishTimedOut = false
        recordingFinishDeadlineScheduled = false
        recordingFileClosed = false
        let waiting = recordingStopCalls
        recordingStopCalls = []
        if playable, let completedMetadata {
            let result = Self.takeResult(url: url, durationMs: durationMs, metadata: completedMetadata, interrupted: interrupted)
            // Snapshots belong to this take, including late completion after
            // its start promise rejected or the camera session was closed.
            lastRecording = result
            waiting.forEach { resolve($0, result) }
            emit("recordingStopped", result, retained: true)
            if !reportedSuccessful { emit("cameraError", ["code": "camera_recording_interrupted", "message": "Recording was interrupted. The playable take is kept with your earlier takes."]) }
        } else {
            lastRecording = nil
            waiting.forEach { reject($0, "This take did not produce a playable video. Your earlier takes are kept.", "camera_recording_failed") }
            emit("cameraError", ["code": "camera_recording_failed", "message": "This take did not produce a playable video. Your earlier takes are kept."])
        }
        recordingMetadata = nil
        endFinishingTask()
        if !wantsCamera { teardown() }
        else if !foreground || captureInterrupted || audioInterrupted {
            if session.isRunning { session.stopRunning() }
        } else { resumeIfPossible() }
    }

    private func failCamera(_ failure: CameraFailure) {
        cancelReady(code: failure.code, message: failure.message)
        emit("cameraError", ["code": failure.code, "message": failure.message])
        wantsCamera = false
        previewReady = false
        generation += 1
        if recordingPhase != .idle { requestRecordingStop(interrupted: true) }
        else { teardown() }
    }

    private func cancelReady(code: String, message: String) {
        if let call = pendingReadyCall { pendingReadyCall = nil; reject(call, message, code) }
    }

    private func teardown() {
        turnOffTorch()
        if session.isRunning { session.stopRunning() }
        session.beginConfiguration()
        session.inputs.forEach { session.removeInput($0) }
        session.outputs.forEach { session.removeOutput($0) }
        session.commitConfiguration()
        videoInput = nil
        audioInput = nil
        configured = false
        authorized = false
        previewAttached = false
        previewReady = false
        captureInterrupted = false
        audioInterrupted = false
        captureId = nil
        contextId = nil
        let token = generation
        let calls = closeCalls
        closeCalls = []
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.previewGeneration = token
            self.previewLayer?.session = nil
            self.previewView?.removeFromSuperview()
            self.previewLayer = nil
            self.previewView = nil
            if let web = self.bridge?.webView, let appearance = self.savedWebAppearance {
                web.isOpaque = appearance.opaque
                web.backgroundColor = appearance.background
                web.scrollView.backgroundColor = appearance.scrollBackground
            }
            self.savedWebAppearance = nil
            calls.forEach { $0.resolve() }
        }
    }

    private func turnOffTorch() {
        guard let device = videoInput?.device, device.hasTorch, device.torchMode != .off, device.isTorchModeSupported(.off) else { return }
        do { try device.lockForConfiguration(); device.torchMode = .off; device.unlockForConfiguration() }
        catch { /* Session teardown still releases the hardware if its lock fails. */ }
    }

    private func rejectStartRecording(_ message: String, _ code: String) {
        if let call = recordingStartCall { recordingStartCall = nil; reject(call, message, code) }
    }

    private func rejectFinishingWaiters() {
        let waiting = recordingStopCalls
        recordingStopCalls = []
        waiting.forEach { reject($0, "The take is still finishing. Its file is retained; wait for it to close before recording again.", "camera_recording_finish_timeout") }
        let closing = closeCalls
        closeCalls = []
        closing.forEach { reject($0, "The recording is still finishing. Its file is retained.", "camera_recording_finish_timeout") }
    }

    private var clearMarker: URL {
        recordingsDirectory.deletingLastPathComponent().appendingPathComponent("SidequestCamera.clear")
    }

    /// The marker survives process termination until all old files are purged.
    /// No camera/recovery is allowed to reopen signed-out takes while it exists.
    private func applyPendingClear() throws {
        guard FileManager.default.fileExists(atPath: clearMarker.path) else { return }
        guard recordingPhase == .idle else { throw CameraFailure(code: "camera_cleanup_pending", message: "Signed-out recordings are still closing.") }
        if FileManager.default.fileExists(atPath: recordingsDirectory.path) { try FileManager.default.removeItem(at: recordingsDirectory) }
        try FileManager.default.removeItem(at: clearMarker)
        issuedFiles.removeAll()
        discardedFiles.removeAll()
        issuedRecordingIds.removeAll()
        lastRecording = nil
    }

    private func finishClearingRecordings() {
        guard clearingRecordings, recordingPhase == .idle || recordingFileClosed else { return }
        rejectStartRecording("Signed-out recordings were cleared.", "camera_cleared")
        let stopping = recordingStopCalls
        recordingStopCalls = []
        stopping.forEach { reject($0, "Signed-out recordings were cleared.", "camera_cleared") }
        recordingPhase = .idle
        recordingURL = nil
        recordingMetadata = nil
        requestedRecordingStop = false
        recordingFinishTimedOut = false
        recordingFinishDeadlineScheduled = false
        recordingFileClosed = false
        lastRecording = nil
        endFinishingTask()
        teardown()
        do {
            try applyPendingClear()
            clearingRecordings = false
            let waiting = clearCalls
            clearCalls = []
            waiting.forEach { resolve($0) }
        } catch {
            let waiting = clearCalls
            clearCalls = []
            waiting.forEach { reject($0, "Saved recordings could not be fully cleared. Retry device cleanup.", "camera_cleanup_failed") }
            // Keep the clear marker and block access; retrying clear is safe.
        }
    }

    private func rejectClearWaiters() {
        let waiting = clearCalls
        clearCalls = []
        waiting.forEach { reject($0, "The recording is still closing. Signed-out recordings stay inaccessible and will be purged when it closes.", "camera_cleanup_pending") }
    }

    private func beginFinishingTask() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.finishingTask == .invalid else { return }
            self.finishingTask = UIApplication.shared.beginBackgroundTask(withName: "Finish Sidequest camera take") { [weak self] in
                guard let self else { return }
                self.sessionQueue.async {
                    if self.movieOutput.isRecording { self.movieOutput.stopRecording() }
                    self.emit("cameraError", ["code": "camera_background_finish_expired", "message": "Recording was interrupted. The recording file is retained while it finishes."])
                }
                self.endFinishingTask()
            }
        }
    }

    private func endFinishingTask() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.finishingTask != .invalid else { return }
            UIApplication.shared.endBackgroundTask(self.finishingTask)
            self.finishingTask = .invalid
        }
    }

    private func emit(_ name: String, _ data: [String: Any], retained: Bool = false) {
        DispatchQueue.main.async { [weak self] in self?.notifyListeners(name, data: data, retainUntilConsumed: retained) }
    }
    private func resolve(_ call: CAPPluginCall, _ result: [String: Any] = [:]) {
        DispatchQueue.main.async { call.resolve(result) }
    }
    private func reject(_ call: CAPPluginCall, _ message: String, _ code: String) {
        DispatchQueue.main.async { call.reject(message, code) }
    }

    private static func position(_ value: String) -> AVCaptureDevice.Position? {
        switch value { case "back": return .back; case "front": return .front; default: return nil }
    }
    private static func validIdentifier(_ value: String?) -> String? {
        guard let value, value.count == 36, UUID(uuidString: value) != nil else { return nil }
        return value
    }
    private static func validContext(_ value: String?) -> String? {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:._-")
        guard let value, !value.isEmpty, value.count <= 256, value.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        return value
    }
    private static func sidecar(for url: URL) -> URL {
        url.deletingPathExtension().appendingPathExtension("json")
    }
    private static func readMetadata(for url: URL) -> StoredTake? {
        let sidecar = sidecar(for: url)
        guard let values = try? sidecar.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]), values.isRegularFile == true, values.isSymbolicLink != true, (values.fileSize ?? Int.max) <= 4_096,
              let data = try? Data(contentsOf: sidecar), let metadata = try? JSONDecoder().decode(StoredTake.self, from: data), metadata.version == 1,
              validContext(metadata.contextId) != nil, validIdentifier(metadata.captureId) != nil, validIdentifier(metadata.recordingId) != nil,
              metadata.startedAtMs.isFinite, metadata.startedAtMs > 0 else { return nil }
        return metadata
    }
    private static func inspectMovie(_ url: URL) async -> InspectedMovie {
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
        guard size > 0 else { return InspectedMovie(durationMs: 0, playable: false) }
        let asset = AVURLAsset(url: url)
        let duration = try? await asset.load(.duration)
        let tracks = try? await asset.loadTracks(withMediaType: .video)
        let isPlayable = (try? await asset.load(.isPlayable)) ?? false
        let milliseconds = duration.map { CMTimeGetSeconds($0) * 1_000 } ?? 0
        let playable = isPlayable && milliseconds.isFinite && milliseconds > 0 && !(tracks?.isEmpty ?? true)
        return InspectedMovie(durationMs: milliseconds, playable: playable)
    }
    private static func takeResult(url: URL, durationMs: Double, metadata: StoredTake, interrupted: Bool, recovered: Bool = false) -> [String: Any] {
        ["fileUrl": url.absoluteString, "durationMs": durationMs, "mimeType": "video/quicktime", "interrupted": interrupted,
         "contextId": metadata.contextId, "captureId": metadata.captureId, "recordingId": metadata.recordingId,
         "startedAtMs": metadata.startedAtMs, "recovered": recovered]
    }
    private static func previewFrame(_ call: CAPPluginCall) -> CGRect? {
        guard let object = call.getObject("preview"),
              let x = object["x"] as? Double, let y = object["y"] as? Double,
              let width = object["width"] as? Double, let height = object["height"] as? Double,
              [x, y, width, height].allSatisfy({ $0.isFinite }), width > 0, height > 0,
              abs(x) <= 10_000, abs(y) <= 10_000, width <= 10_000, height <= 10_000 else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }
    private static func requestMediaPermissions(_ completion: @escaping (Result<Void, CameraFailure>) -> Void) {
        func microphone() {
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .authorized: completion(.success(()))
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    completion(granted ? .success(()) : .failure(CameraFailure(code: "camera_microphone_permission_denied", message: "Enable microphone access in iPhone Settings to record sound, or import a video.")))
                }
            default: completion(.failure(CameraFailure(code: "camera_microphone_permission_denied", message: "Enable microphone access in iPhone Settings to record sound, or import a video.")))
            }
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: microphone()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted { DispatchQueue.main.async { microphone() } }
                else { completion(.failure(CameraFailure(code: "camera_permission_denied", message: "Enable camera access in iPhone Settings, or import a video."))) }
            }
        default: completion(.failure(CameraFailure(code: "camera_permission_denied", message: "Enable camera access in iPhone Settings, or import a video.")))
        }
    }
}
