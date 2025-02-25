/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the Microsoft Live Share SDK License.
 */

import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { IRuntimeSignaler } from "./LiveEventScope";

/**
 * Callback function used to the get the current state of an live object that's being
 * synchronized.
 * @template TState Type of state object being synchronized.
 * @param connecting If true a "connect" message is being sent and the initial connecting state of the object is being requested.
 * @returns The objects current state or undefined if not known or available.
 */
export type GetSynchronizationState<TState extends object> = (
    connecting: boolean
) => TState | undefined;

/**
 * Callback function used to the receive the state update sent by a remote live object.
 * @template TState Type of state object being synchronized.
 * @param connecting If true a "connect" message was received and `state` represents the remote objects initial state.
 * @param state The remote object initial or current state.
 * @param senderId The clientId of the sender provider for role verification purposes.
 */
export type UpdateSynchronizationState<TState extends object> = (
    connecting: boolean,
    state: TState | undefined,
    senderId: string
) => void;

/**
 * Duck type of something that provides the expected signalling functionality at the container level.
 *
 * @remarks
 * Simplifies the mocks needed to unit test the `LiveObjectSynchronizer`. Applications can
 * just pass `this.context.containerRuntime` to any class that takes an `IContainerRuntimeSignaler`.
 */
export interface IContainerRuntimeSignaler {
    on(
        event: "signal",
        listener: (message: IInboundSignalMessage, local: boolean) => void
    ): this;
    submitSignal(type: string, content: any): void;
}

/**
 * Synchronizes the underlying state of an live object with all of the other instances of
 * the object connected to the same container.
 *
 * @remarks
 * When a synchronizer for a live object is first created it will broadcast a `"connect"`
 * message, containing the objects initial state, to all other instances of the object that are
 * currently running on other clients. Those instances will respond to the sent "connect" message
 * by broadcasting an `"update"` message containing the current state of their object.
 *
 * Anytime a remote "connect" or "update" event is received, the synchronizer will call the passed
 * in `updateState` callback with the remote objects state and the senders clientId for role
 * verification purposes. The logic for processing these state updates will vary but implementations
 * will generally want to include a timestamp in their state update so that clients can protect
 * against out-of-order and delayed updates. Deriving your state update from `ILiveEvent` and
 * using `LiveEvent.isNewer` to compare the received update with the current update makes this
 * simple.
 *
 * Once the initial "connect" event is sent, the synchronizer will periodically broadcast additional
 * "update" events containing the live objects current state. This redundancy helps to guard
 * against missed events and can be used as a ping for scenarios like presence where users can
 * disconnect from the container without notice.  The rate at which these ping events are sent can be
 * adjusted globally by setting the static `LiveObjectSynchronizer.updateInterval` property.
 *
 * While each new synchronizer instance will result in a separate "connect" message being sent, the
 * periodic updates that are sent get batched together into a single "update" message. This lets apps
 * add as many live objects to a container as they'd like without increasing the number of
 * messages being broadcast to the container.
 *
 * Only a single synchronizer is allowed per live object. Attempting to create more than one
 * synchronizer for the same live object will result in an exception being raised.
 * @template TState Type of state object being synchronized. This object should be a simple JSON object that uses only serializable primitives.
 */
export class LiveObjectSynchronizer<TState extends object> {
    private readonly _id: string;
    private readonly _containerRuntime: IContainerRuntimeSignaler;
    private _isDisposed = false;

    /**
     * Creates a new `LiveObjectSynchronizer` instance.
     *
     * @remarks
     * Consumers should subscribe to the synchronizers `"received"` event to process the remote
     * state updates being sent by other instances of the live object.
     * @param id ID of the live object being synchronized. This should be the value of `this.id` in a class that derives from `DataObject`.
     ^ @param runtime The objects local runtime. This should be the value of `this.runtime`.
     * @param containerRuntime The runtime for the objects container. This should be the value of `this.context.containerRuntime`.
     * @param getState A function called to retrieve the objects current state. This will be called prior to a "connect" or "update" message being sent.
     * @param updateState A function called to process a state update received from a remote instance. This will be called anytime a "connect" or "update" message is received.
     */
    constructor(
        id: string,
        runtime: IRuntimeSignaler,
        containerRuntime: IContainerRuntimeSignaler,
        getState: GetSynchronizationState<TState>,
        updateState: UpdateSynchronizationState<TState>
    ) {
        this._id = id;
        this._containerRuntime = containerRuntime;

        LiveObjectSynchronizer.registerObject<TState>(
            runtime,
            containerRuntime,
            id,
            { getState, updateState }
        );
    }

    /**
     * Disposes of the synchronizer.
     *
     * @remarks
     * All synchronization for the container will stop once the last instance has been disposed of.
     */
    public dispose(): void {
        if (!this._isDisposed) {
            this._isDisposed = true;
            LiveObjectSynchronizer.unregisterObject(
                this._containerRuntime,
                this._id
            );
        }
    }

    public static updateInterval = 5000;

    private static _synchronizers = new Map<any, ContainerSynchronizer>();

    private static registerObject<TState extends object>(
        runtime: IRuntimeSignaler,
        containerRuntime: IContainerRuntimeSignaler,
        id: string,
        handlers: GetAndUpdateStateHandlers<TState>
    ): void {
        // Get/create containers synchronizer
        let synchronizer = this._synchronizers.get(containerRuntime);
        if (!synchronizer) {
            synchronizer = new ContainerSynchronizer(runtime, containerRuntime);
            this._synchronizers.set(containerRuntime, synchronizer);
        }

        // Register object
        synchronizer.registerObject(
            id,
            handlers as unknown as GetAndUpdateStateHandlers<object>
        );
    }

    private static unregisterObject(
        containerRuntime: IContainerRuntimeSignaler,
        id: string
    ): void {
        let synchronizer = this._synchronizers.get(containerRuntime);
        if (synchronizer) {
            const lastObject = synchronizer.unregisterObject(id);
            if (lastObject) {
                this._synchronizers.delete(containerRuntime);
            }
        }
    }
}

const CONNECT_EVENT = "connect";
const UPDATE_EVENT = "update";

interface GetAndUpdateStateHandlers<TState extends object> {
    getState: GetSynchronizationState<TState>;
    updateState: UpdateSynchronizationState<TState>;
}

interface StateSyncEventContent {
    [id: string]: object | undefined;
}

class ContainerSynchronizer {
    private readonly _runtime: IRuntimeSignaler;
    private readonly _containerRuntime: IContainerRuntimeSignaler;
    private readonly _objects = new Map<
        string,
        GetAndUpdateStateHandlers<object>
    >();
    private _unconnectedKeys: string[] = [];
    private _connectedKeys: string[] = [];
    private _refCount = 0;
    private _hTimer: any;

    constructor(
        runtime: IRuntimeSignaler,
        containerRuntime: IContainerRuntimeSignaler
    ) {
        // Listen for runtime to connect/re-connect
        this._runtime = runtime;
        this._runtime.on("connected", (clientId) => {
            if (this._unconnectedKeys.length > 0) {
                // Send CONNECT_EVENT for all unconnected objects
                this.sendGroupEvent(this._unconnectedKeys, CONNECT_EVENT);

                // Move keys to connected list
                this._connectedKeys = this._connectedKeys.concat(
                    this._unconnectedKeys
                );
                this._unconnectedKeys = [];
            }
        });

        // Listen for a global CONNECT/UPDATE event to be received
        this._containerRuntime = containerRuntime;
        this._containerRuntime.on("signal", (message, local) => {
            // Ignore local signals
            if (!local && typeof message.content == "object") {
                switch (message.type) {
                    case CONNECT_EVENT:
                        this.dispatchUpdates(
                            message.clientId!,
                            message.content,
                            true
                        );
                        break;
                    case UPDATE_EVENT:
                        this.dispatchUpdates(
                            message.clientId!,
                            message.content,
                            false
                        );
                        break;
                }
            }
        });
    }

    public registerObject(
        id: string,
        handlers: GetAndUpdateStateHandlers<object>
    ): void {
        if (this._objects.has(id)) {
            throw new Error(
                `LiveObjectSynchronizer: too many calls to registerObject() for object '${id}'`
            );
        }

        // Save object ref
        this._objects.set(id, handlers);

        // Connect object to group
        if (this._runtime.connected) {
            // Send single connect event
            const connectState: StateSyncEventContent = {
                [id]: handlers.getState(true),
            };
            this._containerRuntime.submitSignal(CONNECT_EVENT, connectState);
            this._connectedKeys.push(id);
        } else {
            // Queue connect event
            this._unconnectedKeys.push(id);
        }

        // Start update timer on first ref
        if (this._refCount++ == 0) {
            this._hTimer = setInterval(() => {
                try {
                    this.sendGroupEvent(this._connectedKeys, UPDATE_EVENT);
                } catch (err: any) {
                    console.error(
                        `LiveObjectSynchronizer: error sending update - ${err.toString()}`
                    );
                }
            }, LiveObjectSynchronizer.updateInterval);
        }
    }

    public unregisterObject(id: string): boolean {
        if (this._objects.has(id)) {
            // Remove object ref
            this._objects.delete(id);

            // Stop update timer on last de-ref
            if (--this._refCount == 0) {
                clearInterval(this._hTimer);
                this._hTimer = undefined;
                return true;
            }

            // Remove id from key lists
            this._connectedKeys = this._connectedKeys.filter(
                (key) => key != id
            );
            this._unconnectedKeys = this._unconnectedKeys.filter(
                (key) => key != id
            );
        }

        return false;
    }

    private sendGroupEvent(keys: string[], evt: string): void {
        // Compose list of updates
        const updates: StateSyncEventContent = {};
        keys.forEach((id) => {
            try {
                // Ignore components that return undefined
                const state = this._objects.get(id)?.getState(false);
                if (typeof state == "object") {
                    updates[id] = state;
                }
            } catch (err: any) {
                console.error(
                    `LiveObjectSynchronizer: error getting an objects state - ${err.toString()}`
                );
            }
        });

        // Send event if we have any updates to broadcast
        // - `send` is only set if at least one component returns an update.
        if (Object.keys(updates).length > 0) {
            this._containerRuntime.submitSignal(evt, updates);
        }
    }

    private dispatchUpdates(
        senderId: string,
        updates: StateSyncEventContent,
        connecting: boolean
    ): void {
        const keys: string[] = [];
        for (const id in updates) {
            // Dispatch received state update
            const handlers = this._objects.get(id);
            if (handlers) {
                try {
                    keys.push(id);
                    const state = updates[id];
                    if (typeof state == "object") {
                        handlers.updateState(connecting, state, senderId);
                    }
                } catch (err: any) {
                    console.error(
                        `LiveObjectSynchronizer: error processing received update - ${err.toString()}`
                    );
                }
            }
        }

        // Send immediate update of current state if connect message
        if (connecting) {
            this.sendGroupEvent(keys, UPDATE_EVENT);
        }
    }
}
