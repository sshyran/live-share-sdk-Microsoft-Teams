/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the Microsoft Live Share SDK License.
 */

import EventEmitter from "events";
import {
    IErrorEvent,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import { ILiveEvent, UserMeetingRole } from "./interfaces";
import { LiveEvent } from "./LiveEvent";

/**
 * Live event callback.
 * @template TEvent Type of event being sent/received.
 * @param evt The event that was sent/received.
 * @param local If true the `evt` is an event that was sent.
 */
export type LiveEventListener<TEvent extends ILiveEvent> = (
    evt: TEvent,
    local: boolean
) => void;

/**
 * Duck type of something that provides the expected signalling functionality:
 * A way to verify we can signal, a way to send a signal, and a way to listen for incoming signals
 */
export interface IRuntimeSignaler {
    readonly clientId: string | undefined;
    readonly connected: boolean;
    readonly logger: ITelemetryLogger;
    on(event: "connected", listener: (clientId: string) => void): this;
    on(
        event: "signal",
        listener: (message: IInboundSignalMessage, local: boolean) => void
    ): this;
    submitSignal(type: string, content: any): void;
}

/**
 * Object responsible for sending and receiving live share events.
 *
 * @remarks
 * Live objects send and receive events using an event scope. Event scopes can be restricted
 * to only receive events from clients with specific roles. Any events that are received from
 * clients without an allowed role type will be ignored.
 *
 * Event scopes are isolated on a per Fluid object basis. That means that two different Fluid
 * objects using the same event names don't have to worry about collisions.  Two event scopes
 * within the same Fluid object, however, don't have any isolation. You can use multiple event
 * scopes within the same FLuid object, you just need to be careful that they send different
 * events.
 */
export class LiveEventScope extends TypedEventEmitter<IErrorEvent> {
    private readonly emitter = new EventEmitter();
    private readonly _runtime: IRuntimeSignaler;
    private _allowedRoles: UserMeetingRole[];

    /**
     * Creates a new `LiveEventScope` instance.
     * @param runtime A Fluid objects runtime instance, typically `this.runtime`.
     * @param allowedRoles Optional. List of roles allowed to send events using this scope.
     * You should use a second scope if you need mixed permission support.
     */
    constructor(runtime: IRuntimeSignaler, allowedRoles?: UserMeetingRole[]) {
        super();
        this._runtime = runtime;
        this._allowedRoles = allowedRoles || [];
        this.emitter.on("error", (error) => {
            this.emit("error", error);
        });
        this._runtime.on("signal", (message, local) => {
            // We don't trust the clientId in the message content as it could have been tampered
            // with (in fact it could be missing if the message was queued when disconnected.)
            // We'll overwrite the contents clientId with the messages clientId which can't be
            // spoofed.
            const clientId = message.clientId;
            (message.content as ILiveEvent).clientId = clientId as string;

            // Only call listeners when the runtime is connected and if the signal has an
            // identifiable sender clientId.  The listener is responsible for deciding how
            // it wants to handle local/remote signals
            if (this._runtime.connected && clientId !== null) {
                LiveEvent.verifyRolesAllowed(clientId, this._allowedRoles)
                    .then((value) => {
                        if (value) {
                            this.emitter.emit(
                                message.type,
                                message.content,
                                local
                            );
                        } else {
                            this._runtime.logger.sendErrorEvent(
                                { eventName: "SharedEvent:invalidRole" },
                                new Error(
                                    `The clientId of "${clientId}" doesn't have a role of ${JSON.stringify(
                                        this._allowedRoles
                                    )}.`
                                )
                            );
                        }
                    })
                    .catch((err) => {
                        this._runtime.logger.sendErrorEvent(
                            { eventName: "SharedEvent:invalidRole" },
                            err
                        );
                    });
            }
        });
    }

    /**
     * List of roles allowed to send events through this scope.
     */
    public get allowedRoles(): UserMeetingRole[] {
        return this._allowedRoles;
    }

    public set allowedRoles(values: UserMeetingRole[]) {
        this._allowedRoles = values;
    }

    /**
     * The runtimes current client ID. This will be `undefined` if the client is disconnected.
     */
    public get clientId(): string | undefined {
        return this._runtime.clientId;
    }

    /**
     * Registers a listener for a named event.
     * @template TEvent Type of event to listen for.
     * @param eventName Name of event to listen for.
     * @param listener Function to call when the named event is sent or received.
     */
    public onEvent<TEvent extends ILiveEvent>(
        eventName: string,
        listener: LiveEventListener<TEvent>
    ): this {
        this.emitter.on(eventName, listener);
        return this;
    }

    /**
     * Un-registers a listener for a named event.
     * @template TEvent Type of event being listened for.
     * @param eventName Name of event to un-register.
     * @param listener Function that was originally passed to `onEvent()`.
     */
    public offEvent<TEvent extends ILiveEvent>(
        eventName: string,
        listener: LiveEventListener<TEvent>
    ): this {
        this.emitter.off(eventName, listener);
        return this;
    }

    /**
     * Sends an event to other event scope instances for the Fluid object.
     * @template TEvent Type of event to send.
     * @param eventName Name of the event to send.
     * @param evt Optional. Partial event object to send. The `ILiveEvent.name`,
     * `ILiveEvent.timestamp`, and `ILiveEvent.clientId`
     * fields will be automatically populated prior to sending.
     * @returns The full event, including `ILiveEvent.name`,
     * `ILiveEvent.timestamp`, and `ILiveEvent.clientId` fields if known.
     */
    public sendEvent<TEvent extends ILiveEvent>(
        eventName: string,
        evt: Partial<TEvent> = {}
    ): TEvent {
        // Clone passed in event and fill out required props.
        const clone: TEvent = {
            ...(evt as TEvent),
            clientId: this._runtime.clientId,
            name: eventName,
            timestamp: LiveEvent.getTimestamp(),
        };

        // Send event
        this._runtime.submitSignal(eventName, clone);

        return clone;
    }
}
