import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";
import pin from "../assets/Pin.png";

const GAME_ASSETS = [mapLabeled, mapUnlabeled, pin];

let preloadPromise: Promise<void> | null = null;

function preloadImage(source: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Failed to preload asset: ${source}`));
        image.src = source;

        if (typeof image.decode === "function") {
            image.decode().then(resolve).catch(() => {
            });
        }
    });
}

export function preloadGameAssets(): Promise<void> {
    if (!preloadPromise) {
        preloadPromise = Promise.allSettled(GAME_ASSETS.map(preloadImage)).then((results) => {
            const failedCount = results.filter((result) => result.status === "rejected").length;
            if (failedCount > 0) {
                console.warn(`Unable to preload ${failedCount} game asset(s).`);
            }
        });
    }

    return preloadPromise;
}

