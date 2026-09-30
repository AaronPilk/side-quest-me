import Capacitor
import MapKit

class SidequestViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SidequestPlacesPlugin())
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
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    // Accessed only on the main queue. Cancellation and deadlines settle once.
    private var active: [String: () -> Void] = [:]

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
