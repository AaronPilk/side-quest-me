import Capacitor
import MapKit
import UIKit
import WebKit

class SidequestViewController: CAPBridgeViewController {
    private let editingStatusSurface = UIView()
    private var statusAreaHandler: SidequestStatusAreaHandler?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SidequestPlacesPlugin())
        guard let content = webView?.configuration.userContentController else { return }
        let handler = SidequestStatusAreaHandler(owner: self)
        statusAreaHandler = handler
        content.add(handler, name: "sidequestStatusArea")
        // This observes presentation only; it cannot invoke app actions or read user text.
        content.addUserScript(WKUserScript(source: """
            (() => {
              let last = '';
              let queued = false;
              const update = () => {
                queued = false;
                const active = document.activeElement;
                const editing = Boolean(active && (
                  active.matches('textarea, select, [contenteditable="true"]') ||
                  (active.matches('input') && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'image', 'file', 'hidden'].includes(active.type))
                ));
                const dark = Boolean(document.querySelector('.capture-overlay, .reel-viewer'));
                const key = `${editing}:${dark}`;
                if (key === last) return;
                last = key;
                window.webkit.messageHandlers.sidequestStatusArea.postMessage({ editing, dark });
              };
              const schedule = () => {
                if (!queued) { queued = true; requestAnimationFrame(update); }
              };
              document.addEventListener('focusin', schedule, true);
              document.addEventListener('focusout', schedule, true);
              new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
              update();
            })();
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let webView else { return }
        // Capacitor normally uses WKWebView as the root. A sibling UIKit surface
        // stays above its scrolling/focus viewport while preserving full-size web content.
        let container = UIView(frame: webView.frame)
        container.backgroundColor = UIColor(red: 245.0 / 255, green: 246.0 / 255, blue: 252.0 / 255, alpha: 1)
        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        view = container
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
        editingStatusSurface.translatesAutoresizingMaskIntoConstraints = false
        editingStatusSurface.isUserInteractionEnabled = false
        editingStatusSurface.isAccessibilityElement = false
        editingStatusSurface.accessibilityElementsHidden = true
        editingStatusSurface.backgroundColor = UIColor(red: 245.0 / 255, green: 246.0 / 255, blue: 252.0 / 255, alpha: 1)
        editingStatusSurface.isHidden = true
        container.addSubview(editingStatusSurface)
        NSLayoutConstraint.activate([
            editingStatusSurface.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            editingStatusSurface.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            editingStatusSurface.topAnchor.constraint(equalTo: container.topAnchor),
            editingStatusSurface.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor)
        ])
    }

    fileprivate func updateStatusArea(editing: Bool, dark: Bool) {
        editingStatusSurface.isHidden = !editing
        editingStatusSurface.backgroundColor = dark
            ? UIColor(red: 9.0 / 255, green: 10.0 / 255, blue: 14.0 / 255, alpha: 1)
            : UIColor(red: 245.0 / 255, green: 246.0 / 255, blue: 252.0 / 255, alpha: 1)
        statusBarStyle = dark ? .lightContent : .darkContent
        setNeedsStatusBarAppearanceUpdate()
    }
}

private final class SidequestStatusAreaHandler: NSObject, WKScriptMessageHandler {
    weak var owner: SidequestViewController?
    init(owner: SidequestViewController) { self.owner = owner }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.scheme == "capacitor",
              message.frameInfo.request.url?.host == "localhost",
              let state = message.body as? [String: Any],
              let editing = state["editing"] as? Bool,
              let dark = state["dark"] as? Bool else { return }
        DispatchQueue.main.async { [weak self] in self?.owner?.updateStatusArea(editing: editing, dark: dark) }
    }
}

/// Native Apple search needs no MapKit JS token. Durable place IDs require iOS 18.
@objc(SidequestPlacesPlugin)
public class SidequestPlacesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SidequestPlacesPlugin"
    public let jsName = "SidequestPlaces"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "search", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lookup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openChatGPT", returnType: CAPPluginReturnPromise)
    ]
    // Accessed only on the main queue. Cancellation and deadlines settle once.
    private var active: [String: () -> Void] = [:]

    /// A fixed public destination only: iOS decides whether its installed app
    /// handles the universal link; otherwise use the external system browser.
    /// Prompts remain on the clipboard for an explicit user paste and send.
    @objc func openChatGPT(_ call: CAPPluginCall) {
        // ChatGPT's published apple-app-site-association matches home with
        // #native. The bare home URL is not an app link (verified 2026-10-01).
        let appDestination = URL(string: "https://chatgpt.com/#native")!
        let browserDestination = URL(string: "https://chatgpt.com/")!
        DispatchQueue.main.async {
            UIApplication.shared.open(appDestination, options: [.universalLinksOnly: true]) { openedApp in
                if openedApp {
                    call.resolve(["destination": "app"])
                    return
                }
                DispatchQueue.main.async {
                    UIApplication.shared.open(browserDestination, options: [:]) { openedWeb in
                        if openedWeb { call.resolve(["destination": "web"]) }
                        else { call.reject("ChatGPT could not open.", "chatgpt_launch_failed") }
                    }
                }
            }
        }
    }

    @objc func availability(_ call: CAPPluginCall) {
        if #available(iOS 18.0, *) { call.resolve(["available": true]) }
        else { call.resolve(["available": false]) }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = call.getString("requestId") { self.active.removeValue(forKey: id)?() }
            call.resolve()
        }
    }

    @objc func search(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 18.0, *) else { call.reject("Place search requires iOS 18."); return }
            guard let id = call.getString("requestId"), !id.isEmpty,
                  let query = call.getString("query")?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !query.isEmpty, query.count <= 300 else { call.reject("Enter a place or area."); return }
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            request.resultTypes = .pointOfInterest
            if let latitude = call.getDouble("latitude"), let longitude = call.getDouble("longitude") {
                let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
                guard CLLocationCoordinate2DIsValid(coordinate) else { call.reject("Invalid search area."); return }
                // This is a regional bias, not a claim that every result is within a radius.
                request.region = MKCoordinateRegion(center: coordinate, latitudinalMeters: 25000, longitudinalMeters: 25000)
            }
            let search = MKLocalSearch(request: request)
            self.begin(id, call: call) { search.cancel() }
            search.start { response, error in
                guard self.active.removeValue(forKey: id) != nil else { return }
                guard error == nil, let response else { call.reject("Apple Maps couldn’t load places. Try again."); return }
                let places = response.mapItems.compactMap { self.serialize($0) }
                call.resolve(["places": Array(places.prefix(8))])
            }
        }
    }

    @objc func lookup(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 18.0, *) else { call.reject("Place lookup requires iOS 18."); return }
            guard let id = call.getString("requestId"), !id.isEmpty,
                  let placeId = call.getString("placeId"), placeId.count <= 256,
                  let identifier = MKMapItem.Identifier(rawValue: placeId) else { call.reject("Invalid Apple place ID."); return }
            let request = MKMapItemRequest(mapItemIdentifier: identifier)
            self.begin(id, call: call) { request.cancel() }
            request.getMapItem { item, error in
                guard self.active.removeValue(forKey: id) != nil else { return }
                guard error == nil, let item, let place = self.serialize(item) else {
                    call.reject("This place’s latest details aren’t available."); return
                }
                call.resolve(["place": place])
            }
        }
    }

    private func begin(_ id: String, call: CAPPluginCall, cancel: @escaping () -> Void) {
        active.removeValue(forKey: id)?()
        active[id] = { cancel(); call.reject("Apple Maps request cancelled or timed out.", "CANCELLED") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { self.active.removeValue(forKey: id)?() }
    }

    @available(iOS 18.0, *)
    private func serialize(_ item: MKMapItem) -> [String: Any]? {
        guard let id = item.identifier?.rawValue, let name = item.name, !name.isEmpty else { return nil }
        let coordinate = item.placemark.coordinate
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
        return [
            "id": id,
            "name": name,
            "formattedAddress": item.placemark.title ?? "",
            "coordinate": ["latitude": coordinate.latitude, "longitude": coordinate.longitude],
            "pointOfInterestCategory": category(item.pointOfInterestCategory) as Any? ?? NSNull()
        ]
    }

    @available(iOS 18.0, *)
    private func category(_ value: MKPointOfInterestCategory?) -> String? {
        // Only map documented provider categories used by recommendation matching.
        switch value {
        case .park: return "Park"
        case .beach: return "Beach"
        case .nationalPark: return "NationalPark"
        case .hiking: return "Hiking"
        case .landmark: return "Landmark"
        case .nationalMonument: return "NationalMonument"
        case .museum: return "Museum"
        case .library: return "Library"
        case .cafe: return "Cafe"
        case .restaurant: return "Restaurant"
        case .bakery: return "Bakery"
        case .foodMarket: return "FoodMarket"
        default: return nil
        }
    }
}
