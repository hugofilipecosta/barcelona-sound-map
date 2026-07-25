import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { BARCELONA_CENTER, resultPosition } from "../lib/geo";
import type { ResultType, SoundResult } from "../types";

const markerIcons: Record<ResultType, L.DivIcon> = {
  concert: L.divIcon({
    className: "route-marker route-marker-concert",
    iconSize: [18, 18],
  }),
  store: L.divIcon({
    className: "route-marker route-marker-store",
    iconSize: [18, 18],
  }),
  spot: L.divIcon({
    className: "route-marker route-marker-spot",
    iconSize: [18, 18],
  }),
};

export function RouteMap({ stops }: { stops: SoundResult[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
    }).setView(BARCELONA_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const points = stops.map((stop) => resultPosition(stop));
    stops.forEach((stop, index) => {
      const marker = L.marker(points[index], { icon: markerIcons[stop.type] }).addTo(map);
      marker.bindTooltip(stop.name, { direction: "top", offset: [0, -6] });
      markersRef.current.push(marker);
    });

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points).pad(points.length > 1 ? 0.35 : 0.6), {
        maxZoom: 15,
      });
    } else {
      map.setView(BARCELONA_CENTER, 13);
    }
  }, [stops]);

  return <div ref={containerRef} className="route-map" aria-label="Route stops map" />;
}
