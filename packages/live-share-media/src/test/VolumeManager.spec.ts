import { strict as assert } from "assert";
import { IMediaPlayer } from "../IMediaPlayer";
import { LimitLevelType, VolumeManager } from "../VolumeManager";
import { Deferred } from "@microsoft/live-share/src/test/Deferred";

describe("VolumeManager", () => {
    it("should ramp down volume", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;
        const volumeManager = new VolumeManager(player);

        assert(player.volume == 1.0);
        volumeManager.startLimiting();
        setTimeout(() => {
            // check volume at halfway point
            assert(player.volume > 0.4);
            assert(player.volume < 0.6);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        setTimeout(() => {
            // check volume at end with 20ms of leeway
            assert(player.volume == volumeManager.limitLevel);
            testAwait.resolve();
        }, volumeManager.volumeChangeDuration * 1000 + 20);

        await testAwait.promise;
    });

    it("should ramp up volume", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;
        const volumeManager = new VolumeManager(player);

        // limit at start
        volumeManager.startLimiting();

        // when limited all the way, test ramp up
        setTimeout(() => {
            assert(player.volume == volumeManager.limitLevel);
            volumeManager.stopLimiting();

            setTimeout(() => {
                // check volume at halfway point
                assert(player.volume > 0.4);
                assert(player.volume < 0.6);
            }, (volumeManager.volumeChangeDuration * 1000) / 2);

            setTimeout(() => {
                // check volume at end with 20ms of leeway
                assert(player.volume == volumeManager.volume);
                testAwait.resolve();
            }, volumeManager.volumeChangeDuration * 1000 + 20);
        }, volumeManager.volumeChangeDuration * 1000 + 20);

        await testAwait.promise;
    });

    it("should ramp down halfway, then ramp up", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;

        const volumeManager = new VolumeManager(player);

        volumeManager.startLimiting();
        setTimeout(() => {
            // check volume at halfway point, begin ramping other direction
            assert(player.volume > 0.4);
            assert(player.volume < 0.6);
            volumeManager.stopLimiting();

            setTimeout(() => {
                // check volume at end with 20ms of leeway
                assert(player.volume == volumeManager.volume);
                testAwait.resolve();
            }, volumeManager.volumeChangeDuration * 1000 + 20);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        await testAwait.promise;
    });

    it("ramp using selected volume", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;

        const volumeManager = new VolumeManager(player);

        volumeManager.volume = 0.3;
        setTimeout(() => {
            // check volume at halfway point
            assert(player.volume > 0.6);
            assert(player.volume < 0.7);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        setTimeout(() => {
            // check volume at end with 20ms of leeway
            assert(player.volume == volumeManager.volume);
            testAwait.resolve();
        }, volumeManager.volumeChangeDuration * 1000 + 20);

        await testAwait.promise;
    });

    it("enable limit, change selected volume, then disable limit", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;
        const volumeManager = new VolumeManager(player);

        volumeManager.startLimiting();
        setTimeout(() => {
            // check volume at halfway point, begin ramping other direction with lower selected volume
            assert(player.volume > 0.4);
            assert(player.volume < 0.6);

            volumeManager.volume = 0.7;
            volumeManager.stopLimiting();

            setTimeout(() => {
                // check volume at end with 20ms of leeway
                assert(player.volume === volumeManager.volume);
                testAwait.resolve();
            }, volumeManager.volumeChangeDuration * 1000 + 20);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        await testAwait.promise;
    });

    it("ramp down with selected volume to 0.3, then up to 0.8", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;

        const volumeManager = new VolumeManager(player);
        volumeManager.volume = 0.3;

        setTimeout(() => {
            // check volume at halfway point
            assert(player.volume > 0.6);
            assert(player.volume < 0.7);
            volumeManager.volume = 0.8;

            setTimeout(() => {
                // check volume at end with 20ms of leeway
                assert(player.volume == volumeManager.volume);
                testAwait.resolve();
            }, volumeManager.volumeChangeDuration * 1000 + 20);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        await testAwait.promise;
    });

    it("test 50% limiting", async () => {
        const testAwait = new Deferred();
        const player = new TestMediaPlayer();
        player.volume = 1.0;

        const volumeManager = new VolumeManager(player);
        volumeManager.limitLevelType = LimitLevelType.percentage;
        volumeManager.limitLevel = 0.5;

        volumeManager.startLimiting();

        setTimeout(() => {
            // check volume at halfway point
            assert(player.volume > 0.7);
            assert(player.volume < 0.8);
        }, (volumeManager.volumeChangeDuration * 1000) / 2);

        setTimeout(() => {
            // check volume at end with 20ms of leeway
            assert(
                player.volume == volumeManager.limitLevel * volumeManager.volume
            );
            testAwait.resolve();
        }, volumeManager.volumeChangeDuration * 1000 + 20);

        await testAwait.promise;
    });
});

// test implementation
class TestMediaPlayer implements IMediaPlayer {
    currentSrc: string;
    currentTime: number;
    duration: number;
    ended: boolean;
    muted: boolean;
    paused: boolean;
    playbackRate: number;
    src: string;
    volume: number;
    load(): void {
        throw new Error("Method not implemented.");
    }
    pause(): void {
        throw new Error("Method not implemented.");
    }
    play(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions | undefined
    ): void {
        throw new Error("Method not implemented.");
    }
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions | undefined
    ): void {
        throw new Error("Method not implemented.");
    }
}
