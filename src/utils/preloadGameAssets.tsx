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
const roundImageRequests = new Map<string, {
    roundNumber: number;
    promise: Promise<CachedRoundImage>;
}>();

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

function takeCachedRoundImage(sessionId: string, expectedRound: number): CachedRoundImage | null {
    const cached = preloadedRoundImages.get(sessionId);
    if (!cached) {
        return null;
    }

    preloadedRoundImages.delete(sessionId);
    return cached.roundNumber === expectedRound ? cached : null;
}

function requestRoundImage(sessionId: string, expectedRound: number): Promise<CachedRoundImage> {
    const existingRequest = roundImageRequests.get(sessionId);
    if (existingRequest?.roundNumber === expectedRound) {
        return existingRequest.promise;
    }

    const promise = getRandomImage(sessionId).then((randomImage) => {
        if (randomImage.completed) {
            throw new Error(`Game completed before round ${expectedRound} could be loaded.`);
        }

        if (randomImage.round_number !== expectedRound) {
            throw new Error(
                `Round image out of sync: expected ${expectedRound}, received ${randomImage.round_number}.`,
            );
        }

        const roundImage = {
            imageUrl: randomImage.image_url,
            roundNumber: randomImage.round_number,
        };

        const activeRequest = roundImageRequests.get(sessionId);
        if (activeRequest?.promise === promise) {
            preloadedRoundImages.set(sessionId, roundImage);
        }

        // Image-byte loading is deliberately detached from metadata retrieval.
        // The Game screen can render immediately and let its own <img> finish loading.
        void preloadImage(roundImage.imageUrl).catch((err) => {
            console.warn("Failed to warm next round image:", err);
        });

        return roundImage;
    }).finally(() => {
        const activeRequest = roundImageRequests.get(sessionId);
        if (activeRequest?.promise === promise) {
            roundImageRequests.delete(sessionId);
        }
    });

    roundImageRequests.set(sessionId, { roundNumber: expectedRound, promise });
    return promise;
}

export async function preloadNextRoundImage(sessionId: string, expectedRound: number): Promise<void> {
    const cached = preloadedRoundImages.get(sessionId);
    if (cached?.roundNumber === expectedRound) {
        return;
    }
    if (cached) {
        preloadedRoundImages.delete(sessionId);
    }

    try {
        await requestRoundImage(sessionId, expectedRound);
    } catch (err) {
        console.warn("Failed to preload next round image:", err);
    }
}

export async function loadRoundImage(sessionId: string, expectedRound: number) {
    const cached = takeCachedRoundImage(sessionId, expectedRound);
    if (cached) {
        return {
            image_url: cached.imageUrl,
            round_number: cached.roundNumber,
            completed: false as const,
        };
    }

    const roundImage = await requestRoundImage(sessionId, expectedRound);
    takeCachedRoundImage(sessionId, expectedRound);

    return {
        image_url: roundImage.imageUrl,
        round_number: roundImage.roundNumber,
        completed: false as const,
    };
}

