import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";
import pin from "../assets/Pin.png";
import { getRandomImage } from "./api.tsx";

const GAME_ASSETS = [mapLabeled, mapUnlabeled, pin];

let preloadPromise: Promise<void> | null = null;

type CachedRoundImage = {
    imageUrl: string;
    roundNumber: number;
};

const preloadedRoundImages = new Map<string, CachedRoundImage>();
const preloadingRoundImages = new Set<string>();

function preloadImage(source: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            if (typeof image.decode === "function") {
                image.decode().then(resolve, resolve);
            } else {
                resolve();
            }
        };
        image.onerror = () => reject(new Error(`Failed to preload asset: ${source}`));
        image.src = source;
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

export async function preloadNextRoundImage(sessionId: string): Promise<void> {
    if (preloadedRoundImages.has(sessionId) || preloadingRoundImages.has(sessionId)) {
        return;
    }

    preloadingRoundImages.add(sessionId);
    try {
        const randomImage = await getRandomImage(sessionId);
        if (randomImage.completed) {
            return;
        }

        await preloadImage(randomImage.image_url);
        preloadedRoundImages.set(sessionId, {
            imageUrl: randomImage.image_url,
            roundNumber: randomImage.round_number,
        });
    } catch (err) {
        console.warn("Failed to preload next round image:", err);
    } finally {
        preloadingRoundImages.delete(sessionId);
    }
}

export function consumePreloadedRoundImage(sessionId: string): CachedRoundImage | null {
    const cached = preloadedRoundImages.get(sessionId);
    if (cached) {
        preloadedRoundImages.delete(sessionId);
    }
    return cached ?? null;
}

