import { useEffect, useState } from "react";
import Minimap from "../components/Minimap";
import CopyIcon from "../assets/icons/Copy.svg";
import type { Point } from "../utils/types";

const MAP_HEIGHT_VH = 0.92;
const MAP_ASPECT_RATIO = 1428 / 1503;
const MAP_LAYOUT_GAP_PX = 32;
const MAP_PANEL_MIN_WIDTH_PX = 360;
const MAP_PAGE_GUTTER_PX = 16;
const SUBMISSION_EMAIL = "andrew.hiponia@sjsu.edu";
const SUBMISSION_ZIP_URL = new URL("../assets/Submitted Images.zip", import.meta.url).href;

type CopyTarget = "coordinates" | "email";

function computeMapHeight() {
    const layoutWidth = Math.min(window.innerWidth - (MAP_PAGE_GUTTER_PX * 2), 1440);
    const isStacked = window.innerWidth <= 760;
    const maxMapWidth = isStacked
        ? layoutWidth
        : layoutWidth - MAP_PANEL_MIN_WIDTH_PX - MAP_LAYOUT_GAP_PX;
    const availableMapWidth = Math.max(maxMapWidth, 240);

    return Math.round(Math.min(
        window.innerHeight * (isStacked ? 0.65 : MAP_HEIGHT_VH),
        availableMapWidth / MAP_ASPECT_RATIO,
    ));
}

function formatCoordinate(value: number | undefined) {
    return value === undefined ? "—" : Math.round(value).toString();
}

export default function MapPage() {
    const [mapHeightPx, setMapHeightPx] = useState(computeMapHeight);
    const [coordinates, setCoordinates] = useState<Point | null>(null);
    const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

    useEffect(() => {
        function handleResize() {
            setMapHeightPx(computeMapHeight());
        }

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const x = formatCoordinate(coordinates?.x);
    const y = formatCoordinate(coordinates?.y);
    const coordinatePair = `(${x}, ${y})`;
    const hasCoordinates = coordinates !== null;

    async function handleCopy(value: string, target: CopyTarget) {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedTarget(target);
            window.setTimeout(() => {
                setCopiedTarget((currentTarget) => currentTarget === target ? null : currentTarget);
            }, 1600);
        } catch {
            setCopiedTarget(null);
        }
    }

    return (
        <main className="map-page">
            <div className="map-layout">
                <div className="map-details">
                    <aside className="map-panel map-coordinate-panel" aria-label="Selected coordinates" aria-live="polite">
                        <p className="map-panel-kicker">Selected coordinates</p>
                        <div className="map-coordinate-values">
                            <div className="map-coordinate-value-group">
                                <span className="map-coordinate-label">x:</span>
                                <strong className="map-coordinate-value">{x}</strong>
                            </div>
                            <div className="map-coordinate-value-group">
                                <span className="map-coordinate-label">y:</span>
                                <strong className="map-coordinate-value">{y}</strong>
                            </div>
                        </div>
                        <div className="map-coordinate-pair-row">
                            <p className="map-coordinate-pair">{coordinatePair}</p>
                            <button
                                type="button"
                                className={`map-copy-button${copiedTarget === "coordinates" ? " is-copied" : ""}`}
                                onClick={() => void handleCopy(coordinatePair, "coordinates")}
                                disabled={!hasCoordinates}
                                aria-label={!hasCoordinates
                                    ? "Place a pin to copy coordinates"
                                    : copiedTarget === "coordinates" ? "Coordinates copied" : "Copy coordinates"}
                                title={!hasCoordinates
                                    ? "Place a pin to copy coordinates"
                                    : copiedTarget === "coordinates" ? "Copied" : "Copy coordinates"}
                            >
                                <img src={CopyIcon} alt="" aria-hidden="true" />
                            </button>
                        </div>
                    </aside>

                    <aside className="map-panel map-explanation-panel" aria-labelledby="map-instructions-title">
                        <header>
                            <h2 id="map-instructions-title">Image submission guide</h2>
                        </header>
                        <div className="map-explanation-body">
                            <ul className="map-instruction-list">
                                <li>All images must have a 16:9 aspect ratio.</li>
                                <li><a href={SUBMISSION_ZIP_URL} download="Submitted Images.zip">Download</a> and unzip the folder hierarchy.</li>
                                <li>Place the pin at the location where the image was taken.</li>
                                <li>Rename the image exactly to <code>(x, y)</code>.</li>
                                <li>Place each image in the correct folder.</li>
                                <li>Zip the completed folder and email it to me!</li>
                            </ul>
                            <div className="map-contact-panel">
                                <button
                                    type="button"
                                    className={`map-copy-button${copiedTarget === "email" ? " is-copied" : ""}`}
                                    onClick={() => void handleCopy(SUBMISSION_EMAIL, "email")}
                                    aria-label={copiedTarget === "email" ? "Email address copied" : "Copy email address"}
                                    title={copiedTarget === "email" ? "Copied" : "Copy email address"}
                                >
                                    <img src={CopyIcon} alt="" aria-hidden="true" />
                                </button>
                                <div className="map-contact-copy">
                                    <span>Send completed submissions to</span>
                                    <a href={`mailto:${SUBMISSION_EMAIL}`}>{SUBMISSION_EMAIL}</a>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                <div className="map-map">
                    <Minimap
                        pinPosition={coordinates}
                        onPinChange={setCoordinates}
                        unlabeled={false}
                        allowPinPlacement
                        mapHeightPx={mapHeightPx}
                        initializeScaleToMinZoom
                    />
                </div>
            </div>
        </main>
    );
}
