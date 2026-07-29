import { useEffect, useMemo, useState } from "react";
import Minimap from "../components/Minimap";
import type { Point } from "../utils/types";

const HEATMAP_HEIGHT_VH = 0.92;

function computeMinimapHeight() {
    return Math.round(window.innerHeight * HEATMAP_HEIGHT_VH);
}

// Ask AI to convert image_map.json into
// { x: ___, y: ___ },
// to fill out this array and make the heatmap work.
// This is intentionally left blank to obscure exact image coordinates.
const RAW_LOCATIONS: Point[] = [
    // { x: ___, y: ___ },
];

export default function Heatmap() {
    const [minimapHeightPx, setMinimapHeightPx] = useState(computeMinimapHeight);
    const [dotSize, setDotSize] = useState(10);

    const uniqueLocations = useMemo(() => {
        const seen = new Set<string>();
        const out: Point[] = [];
        for (const p of RAW_LOCATIONS) {
            const key = `${p.x},${p.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push(p);
            }
        }
        return out;
    }, []);

    useEffect(() => {
        function handleResize() {
            setMinimapHeightPx(computeMinimapHeight());
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <main
            style={{
                backgroundColor: "#ffffff",
                width: "100vw",
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
            }}
        >
            <Minimap
                pinPosition={null}
                onPinChange={() => {}}
                unlabeled={false}
                allowPinPlacement={false}
                mapHeightPx={minimapHeightPx}
                initializeScaleToMinZoom
                heatmapPoints={uniqueLocations}
                heatmapDotSize={dotSize}
            />
            <div
                style={{
                    position: "absolute",
                    bottom: "16px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(0,0,0,0.7)",
                    padding: "8px 16px",
                    borderRadius: "20px",
                }}
            >
                <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>Dot Size</span>
                <input
                    type="range"
                    min={4}
                    max={24}
                    value={dotSize}
                    onChange={(e) => setDotSize(Number(e.target.value))}
                    style={{ width: "120px", cursor: "pointer", accentColor: "#ff3b30" }}
                />
            </div>
        </main>
    );
}
