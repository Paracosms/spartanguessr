import { useEffect, useRef, useState } from "react";
import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";
import pin from "../assets/Pin.png";
type Point = { x: number; y: number };
type ViewState = { scale: number; offset: Point };
type MinimapProps = {
    pinPosition: Point | null;
    onPinChange: (point: Point) => void;
    unlabeled: boolean;
    allowPinPlacement?: boolean;
    mapHeightVh?: number;
    initialScale?: number;
    minZoomFloor?: number;
    actualPosition?: Point | null;
    showActualDot?: boolean;
};
declare global {
    interface Window {
        debug?: boolean;
    }
}

// Constants you might want to tweak
const INITIAL_MAP_POS = {x: -650, y: -750}
const MAP_HEIGHT = 40; // -> 40vh
const PIN_SIZE_PX = 30;
const INITIAL_SCALE = 1; // prod = 1.0
const ZOOM_SPEED = 0.05;

// Handles how far the image can be zoomed. Must be divisible by ZOOM_SPEED.
const BASE_MIN_ZOOM = 0.25;  // this should scale based on MAP_HEIGHT
// The scale that encompasses the entire map on a MIN_ZOOM_REFERENCE_HEIGHT px display
const MIN_ZOOM_REFERENCE_HEIGHT = 1080;
const MAX_DYNAMIC_MIN_ZOOM = 0.45;
const MAX_ZOOM = 2;

// Minimap dimensions in px
const MINIMAP_WIDTH = 1428;
const MINIMAP_HEIGHT = 1503;


export default function Minimap({
    pinPosition,
    onPinChange,
    unlabeled,
    allowPinPlacement = true,
    mapHeightVh = MAP_HEIGHT,
    initialScale = INITIAL_SCALE,
    minZoomFloor,
    actualPosition = null,
    showActualDot = false,
}: MinimapProps) {
    // Don't tweak
    const ASPECT_RATIO = MINIMAP_WIDTH/MINIMAP_HEIGHT;
    const [view, setView] = useState<ViewState>({
        scale: INITIAL_SCALE,
        offset: INITIAL_MAP_POS,
    });
    useEffect(() => {
        setView((prev) => ({
            ...prev,
            scale: initialScale,
        }));
    }, [initialScale]);
    const [minZoom, setMinZoom] = useState(minZoomFloor ?? BASE_MIN_ZOOM);
    const [dragging, setDragging] = useState(false);
    const [debugEnabled, setDebugEnabled] = useState<boolean>(() => window.debug === true);
    const { scale, offset } = view;
    const dragStartRef = useRef({x:0, y:0});
    const dragMouseStartRef = useRef({x:0, y:0});
    const dragMovedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Place pin
    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        if (!allowPinPlacement) {
            return;
        }

        e.preventDefault();

        // Ignore the click that naturally fires after panning
        if (dragMovedRef.current) {
            dragMovedRef.current = false;
            return;
        }

        // Obtain the div
        const container = containerRef.current;
        if (!container) return;

        // Converts global to local mouse coordinates
        const rect = container.getBoundingClientRect();
        const mouseX = round(e.clientX - rect.left, 0);
        const mouseY = round(e.clientY - rect.top, 0);

        // Save pin in map coordinates so it remains anchored through zooms/pans
        onPinChange({
            x: clamp(round((mouseX - offset.x) / scale, 0), 0, MINIMAP_WIDTH),
            y: clamp(round((mouseY - offset.y) / scale, 0), 0, MINIMAP_HEIGHT),
        });
    }

    // Pan
    function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
        if (scale <= minZoom) return;

        e.preventDefault();
        setDragging(true);
        dragMovedRef.current = false;
        dragMouseStartRef.current = { x: e.clientX, y: e.clientY };

        // Prevents image from snapping the corner to the mouse (aka allows for relative image movement)
        // Also stores initial position of map before the pan movement
        dragStartRef.current = {
            x: e.clientX - offset.x,
            y: e.clientY - offset.y,
        };
    }

    // Zoom
    function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
        e.preventDefault();

        // Obtain the div
        const container = containerRef.current;
        if (!container) return;

        // Converts global to local mouse coordinates
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setView((prev) => {
            const zoomFactor = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
            const nextScale = clamp(round(prev.scale + zoomFactor, 4), minZoom, MAX_ZOOM);

            // Avoid useless updates
            if (nextScale === prev.scale) return prev;

            // Keep the pan offset under the mouse fixed when zooming
            const worldX = (mouseX - prev.offset.x) / prev.scale;
            const worldY = (mouseY - prev.offset.y) / prev.scale;

            const unclampedOffset = {
                x: mouseX - worldX * nextScale,
                y: mouseY - worldY * nextScale,
            };

            const nextOffset = clampOffset(unclampedOffset, nextScale, rect.width, rect.height);

            return { scale: nextScale, offset: nextOffset };
        });
    }

    // Listens for mouse input
    useEffect(() => {
        // Runs every time the mouse moves
        function handleMouseMove(e: MouseEvent) {
            if (!dragging) return;

            // Obtain the div
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();

            const nextOffset = {
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y,
            };

            if (
                !dragMovedRef.current &&
                (
                    Math.abs(e.clientX - dragMouseStartRef.current.x) > 2 ||
                    Math.abs(e.clientY - dragMouseStartRef.current.y) > 2
                )
            ) {
                dragMovedRef.current = true;
            }

            // offset.x and offset.y is updated and then used as transform parameters in the <img>
            setView((prev) => ({
                ...prev,
                offset: clampOffset(nextOffset, prev.scale, rect.width, rect.height),
            }));
        }

        function handleMouseUp() {
            setDragging(false);
        }

        // Enable functionality even when mouse leaves <div>
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        // Clean up functions to remove duplicates of event listeners
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragging, scale]); // Run when dragging or scale changes

    // Ensure map fits within boundaries
    useEffect(() => {
        function reclamp() {
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const dynamicMinZoom = getMinZoom(rect.height, mapHeightVh);
            const nextMinZoom =
                minZoomFloor != null ? Math.max(dynamicMinZoom, minZoomFloor) : dynamicMinZoom;
            setMinZoom(nextMinZoom);

            setView((prev) => ({
                scale: clamp(prev.scale, nextMinZoom, MAX_ZOOM),
                offset: clampOffset(prev.offset, clamp(prev.scale, nextMinZoom, MAX_ZOOM), rect.width, rect.height),
            }));
        }

        reclamp();
        window.addEventListener("resize", reclamp);
        return () => window.removeEventListener("resize", reclamp);
    }, [mapHeightVh, minZoomFloor]);

    // Allows `debug = true/false` in the browser console to toggle debug UI
    useEffect(() => {
        const existingDescriptor = Object.getOwnPropertyDescriptor(window, "debug");

        if (!existingDescriptor || existingDescriptor.configurable) {
            let debugValue = window.debug === true;

            Object.defineProperty(window, "debug", {
                configurable: true,
                get() {
                    return debugValue;
                },
                set(value: boolean) {
                    debugValue = Boolean(value);
                    setDebugEnabled(debugValue);
                },
            });
            return;
        }

        // Fallback if another script already defines a debug property.
        const syncInterval = window.setInterval(() => {
            setDebugEnabled(window.debug === true);
        }, 250);

        return () => window.clearInterval(syncInterval);
    }, []);

    // Prevent trackpad pinch-to-zoom on the minimap
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventZoom = (e: WheelEvent) => {
            if (e.ctrlKey) e.preventDefault();
        };

        container.addEventListener("wheel", preventZoom, { passive: false });
        return () => container.removeEventListener("wheel", preventZoom);
    }, []);

    return <>
        {debugEnabled && (
            <>
                <p className="text-white">Debug Coordinates: {offset.x}, {offset.y}</p>
                <p className="text-white">Scale: {scale}</p>
                <p className="text-white">Min Zoom: {minZoom}</p>
                <p className="text-white">
                    Pin: {pinPosition ? `${pinPosition.x}, ${pinPosition.y}` : "not placed"}
                </p>
            </>
        )}
    <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onClick={allowPinPlacement ? handleClick : undefined}
        className="rounded shadow border border-5 border-warning"
        style={{
            height: `${mapHeightVh}vh`,
            aspectRatio: `${ASPECT_RATIO}`,
            position: "relative",
            overflow: "hidden",
            userSelect: "none",
            cursor: "crosshair",
            touchAction: "none",
        }}
    >
        <img
            className={"minimap-img"}
            src={unlabeled ? mapUnlabeled : mapLabeled}
            alt="Campus Minimap"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "top left",
                userSelect: "none",
                pointerEvents: "none",
            }}
        />
        
        {pinPosition && (
            <img
                src={pin}
                alt="Selected location"
                draggable={false}
                style={{
                    position: "absolute",
                    left: `${offset.x + pinPosition.x * scale}px`,
                    top: `${offset.y + pinPosition.y * scale}px`,
                    transform: "translate(-50%, -100%) translate(-5px, -5px)",
                    width: `${PIN_SIZE_PX}px`,
                    pointerEvents: "none",
                    userSelect: "none",
                }}
            />
        )}
        {showActualDot && actualPosition && (
            <div
                style={{
                    position: "absolute",
                    left: `${offset.x + actualPosition.x * scale}px`,
                    top: `${offset.y + actualPosition.y * scale}px`,
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#ff3b30",
                    border: "2px solid white",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    boxShadow: "0 0 6px rgba(0, 0, 0, 0.6)",
                }}
            />
        )}
    </div>

    </>
}

// round with precision courtesy of stack overflow
function round(value: number, decimal_places: number): number {
    const multiplier: number = Math.pow(10, decimal_places || 0);
    return Math.round(value * multiplier) / multiplier;
}

// fix for 1080p+ monitors
function getMinZoom(containerHeight: number, mapHeightVh: number): number {
    const referenceContainerHeight = (MIN_ZOOM_REFERENCE_HEIGHT * mapHeightVh) / 100;
    const scaledMinZoom = BASE_MIN_ZOOM * (containerHeight / referenceContainerHeight); // should be 0.35 at 1080p, 1440p 4k
    const clampedMinZoom = clamp(scaledMinZoom, BASE_MIN_ZOOM, MAX_DYNAMIC_MIN_ZOOM);

    const baseSteps = Math.ceil(clampedMinZoom / ZOOM_SPEED);
    const extraStepBias = containerHeight > referenceContainerHeight ? 1 : 0;
    const quantizedMinZoom = (baseSteps + extraStepBias) * ZOOM_SPEED;
    return round(clamp(quantizedMinZoom, BASE_MIN_ZOOM, MAX_DYNAMIC_MIN_ZOOM), 2);
}

// top 1 clamp function
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}


// secret chinese clamp function
function clampOffset(
    offset: Point,
    scale: number,
    containerWidth: number,
    containerHeight: number
): Point {
    const scaledWidth = MINIMAP_WIDTH * scale;
    const scaledHeight = MINIMAP_HEIGHT * scale;

    const centeredX = (containerWidth - scaledWidth) / 2;
    const centeredY = (containerHeight - scaledHeight) / 2;

    const minX = scaledWidth <= containerWidth ? centeredX : containerWidth - scaledWidth;
    const maxX = scaledWidth <= containerWidth ? centeredX : 0;

    const minY = scaledHeight <= containerHeight ? centeredY : containerHeight - scaledHeight;
    const maxY = scaledHeight <= containerHeight ? centeredY : 0;

    return {
        x: round(clamp(offset.x, minX, maxX), 0),
        y: round(clamp(offset.y, minY, maxY), 0),
    };
}


