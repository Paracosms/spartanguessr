import { useEffect, useRef, useState } from "react";
import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";
import pin from "../assets/Pin.png";
import type { Point } from "../utils/types";
type ViewState = { scale: number; offset: Point };
type MinimapProps = {
    pinPosition: Point | null;
    onPinChange: (point: Point) => void;
    unlabeled: boolean;
    allowPinPlacement?: boolean;
    mapHeightPx?: number;
    initialScale?: number;
    initialOffset?: Point; // starting pan position, defaults to INITIAL_MAP_POS
    minZoomFloor?: number;
    initializeScaleToMinZoom?: boolean;
    actualPosition?: Point | null;
    showActualDot?: boolean;
};
declare global {
    interface Window {
        debug?: boolean;
    }
}

// Constants you might want to tweak
const INITIAL_MAP_POS = {x: -2100, y: -2300}
const PIN_SIZE_PX = 30;
const PIN_TIP_X_PERCENT = (203 / 388) * 100; // visible tip center in the source sprite
const INITIAL_SCALE = 1; // prod = 1.0
const ZOOM_SPEED = 0.05;

// Handles how far the image can be zoomed. Must be divisible by ZOOM_SPEED.
const BASE_MIN_ZOOM = 0.20;
const MAX_ZOOM = 2;
const FIT_ZOOM_PADDING = 0.98;

// Minimap dimensions in px
const MINIMAP_WIDTH = 1428;
const MINIMAP_HEIGHT = 1503;


export default function Minimap({
    pinPosition,
    onPinChange,
    unlabeled,
    allowPinPlacement = true,
    mapHeightPx,
    initialScale = INITIAL_SCALE,
    initialOffset = INITIAL_MAP_POS,
    minZoomFloor,
    initializeScaleToMinZoom = false,
    actualPosition = null,
    showActualDot = false,
}: MinimapProps) {
    // Don't tweak
    const ASPECT_RATIO = MINIMAP_WIDTH/MINIMAP_HEIGHT;
    const [view, setView] = useState<ViewState>(() => ({
        scale: initialScale,
        offset: initialOffset,
    }));
    const [minZoom, setMinZoom] = useState(minZoomFloor ?? BASE_MIN_ZOOM);
    const [dragging, setDragging] = useState(false);
    const [debugEnabled, setDebugEnabled] = useState<boolean>(() => window.debug === true);
    const { scale, offset } = view;
    const dragStartRef = useRef({x:0, y:0});
    const dragMouseStartRef = useRef({x:0, y:0});
    const dragMovedRef = useRef(false);
    const userAdjustedZoomRef = useRef(false);
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

        const mouse = getLocalPoint(container, e.clientX, e.clientY);
        // Save pin in map coordinates so it remains anchored through zooms/pans
        onPinChange({
            x: clamp(round((mouse.x - offset.x) / scale, 4), 0, MINIMAP_WIDTH),
            y: clamp(round((mouse.y - offset.y) / scale, 4), 0, MINIMAP_HEIGHT),
        });
    }

    // Pan
    function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
        if (scale <= minZoom) return;

        e.preventDefault();
        setDragging(true);
        dragMovedRef.current = false;
        dragMouseStartRef.current = { x: e.clientX, y: e.clientY };

        const container = containerRef.current;
        if (!container) return;
        const mouse = getLocalPoint(container, e.clientX, e.clientY);

        // Prevents image from snapping the corner to the mouse (aka allows for relative image movement)
        // Also stores initial position of map before the pan movement
        dragStartRef.current = {
            x: mouse.x - offset.x,
            y: mouse.y - offset.y,
        };
    }

    // Zoom
    function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
        e.preventDefault();

        // Obtain the div
        const container = containerRef.current;
        if (!container) return;

        const { x: mouseX, y: mouseY } = getLocalPoint(container, e.clientX, e.clientY);

        setView((prev) => {
            const zoomFactor = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
            const nextScale = clamp(round(prev.scale + zoomFactor, 4), minZoom, MAX_ZOOM);

            // Avoid useless updates
            if (nextScale === prev.scale) return prev;

            userAdjustedZoomRef.current = true;

            // Keep the pan offset under the mouse fixed when zooming
            const worldX = (mouseX - prev.offset.x) / prev.scale;
            const worldY = (mouseY - prev.offset.y) / prev.scale;

            const unclampedOffset = {
                x: mouseX - worldX * nextScale,
                y: mouseY - worldY * nextScale,
            };

            const nextOffset = clampOffset(unclampedOffset, nextScale, container.clientWidth, container.clientHeight);

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

            const width = container.clientWidth;
            const height = container.clientHeight;
            const mouse = getLocalPoint(container, e.clientX, e.clientY);

            const nextOffset = {
                x: mouse.x - dragStartRef.current.x,
                y: mouse.y - dragStartRef.current.y,
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

            setView((prev) => ({
                ...prev,
                offset: clampOffset(nextOffset, prev.scale, width, height),
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

            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width <= 0 || height <= 0) return;
            const nextMinZoom = minZoomFloor != null
                ? Math.max(getFitMinZoom(width, height), minZoomFloor)
                : getFitMinZoom(width, height);
            setMinZoom(nextMinZoom);

            setView((prev) => {
                const baseScale =
                    initializeScaleToMinZoom && !userAdjustedZoomRef.current ? nextMinZoom : prev.scale;
                const nextScale = clamp(baseScale, nextMinZoom, MAX_ZOOM);

                return {
                    scale: nextScale,
                    offset: clampOffset(prev.offset, nextScale, width, height),
                };
            });
        }

        reclamp();
        window.addEventListener("resize", reclamp);
        return () => window.removeEventListener("resize", reclamp);
    }, [minZoomFloor, initializeScaleToMinZoom]);

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
            height: mapHeightPx != null ? `${mapHeightPx}px` : "40vh",
            aspectRatio: `${ASPECT_RATIO}`,
            position: "relative",
            overflow: "hidden",
            userSelect: "none",
            cursor: "crosshair",
            touchAction: "none",
        }}
    >
        <div
            style={{
                position: "absolute",
                width: `${MINIMAP_WIDTH}px`,
                height: `${MINIMAP_HEIGHT}px`,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "top left",
                pointerEvents: "none",
            }}
        >
            <img
                className={"minimap-img"}
                src={unlabeled ? mapUnlabeled : mapLabeled}
                alt="Campus Minimap"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    userSelect: "none",
                }}
            />

            {pinPosition && (
                <img
                    src={pin}
                    alt="Selected location"
                    draggable={false}
                    style={{
                        position: "absolute",
                        left: `${pinPosition.x}px`,
                        top: `${pinPosition.y}px`,
                        transform: `scale(${1 / scale}) translate(${-PIN_TIP_X_PERCENT}%, -100%)`,
                        transformOrigin: "top left",
                        width: `${PIN_SIZE_PX / 1.5}px`,
                        userSelect: "none",
                    }}
                />
            )}
            {showActualDot && actualPosition && (
                <div
                    style={{
                        position: "absolute",
                        left: `${actualPosition.x}px`,
                        top: `${actualPosition.y}px`,
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#ff3b30",
                        border: "2px solid white",
                        transform: `scale(${1 / scale}) translate(-50%, -50%)`,
                        transformOrigin: "top left",
                        boxShadow: "0 0 6px rgba(0, 0, 0, 0.6)",
                    }}
                />
            )}
        </div>
    </div>

    </>
}

// round with precision courtesy of stack overflow
function round(value: number, decimal_places: number): number {
    const multiplier: number = Math.pow(10, decimal_places || 0);
    return Math.round(value * multiplier) / multiplier;
}

function getFitMinZoom(containerWidth: number, containerHeight: number): number {
    const fitScale = Math.min(containerWidth / MINIMAP_WIDTH, containerHeight / MINIMAP_HEIGHT) * FIT_ZOOM_PADDING;
    return round(clamp(fitScale, BASE_MIN_ZOOM, MAX_ZOOM), 3);
}

function getLocalPoint(container: HTMLDivElement, clientX: number, clientY: number): Point {
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const renderedScaleX = rect.width / Number.parseFloat(style.width);
    const renderedScaleY = rect.height / Number.parseFloat(style.height);

    return {
        x: (clientX - rect.left) / renderedScaleX - container.clientLeft,
        y: (clientY - rect.top) / renderedScaleY - container.clientTop,
    };
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
        x: clamp(offset.x, minX, maxX),
        y: clamp(offset.y, minY, maxY),
    };
}


