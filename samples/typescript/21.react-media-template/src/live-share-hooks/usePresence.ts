/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    LiveEvent,
    LivePresence,
    LivePresenceUser,
    PresenceState,
    UserMeetingRole,
} from "@microsoft/live-share";
import { useState, useEffect, useRef, useMemo } from "react";
import { app } from "@microsoft/teams-js";

export interface IUserData {
    teamsUserId?: string;
    joinedTimestamp: number;
    name: string;
}

/**
 * Hook for tracking users, roles, and who is in control
 *
 * @remarks
 *
 * @param {LivePresence} presence presence object from Fluid container.
 * @param {UserMeetingRole[]} acceptPlaybackChangesFrom List of acceptable roles for playback transport commands.
 * @param {microsoftTeams.app.Context} context Teams context object
 * @returns `{started, localUser, users, presentingUser, localUserIsEligiblePresenter, localUserIsPresenting, takeControl}` where:
 * - `presenceStarted` is a boolean indicating whether `presence.initialize()` has been called.
 * - `localUser` is the local user's presence object.
 * - `users` is an array of user presence objects in the session.
 * - `localUserIsEligiblePresenter` is a boolean indicating whether the local user is an eligible presenter.
 */
export const usePresence = (
    acceptPlaybackChangesFrom: UserMeetingRole[],
    presence?: LivePresence,
    context?: app.Context
) => {
    const usersRef = useRef<LivePresenceUser<IUserData>[]>([]);
    const [users, setUsers] = useState(usersRef.current);
    const [localUser, setLocalUser] = useState<LivePresenceUser<IUserData>>();
    const [localUserRoles, setLocalUserRoles] = useState<UserMeetingRole[]>([]);
    const [presenceStarted, setStarted] = useState(false);

    // Local user is an eligible presenter
    const localUserIsEligiblePresenter = useMemo(() => {
        if (acceptPlaybackChangesFrom.length === 0) {
            return true;
        }
        if (!presence || !localUser) {
            return false;
        }
        return (
            localUserRoles.filter((role) =>
                acceptPlaybackChangesFrom.includes(role)
            ).length > 0
        );
    }, [acceptPlaybackChangesFrom, presence, localUser, localUserRoles]);

    // Effect which registers SharedPresence event listeners before joining space
    useEffect(() => {
        if (presence && !presence.isInitialized && context) {
            // Register presenceChanged event listener
            presence.on(
                "presenceChanged",
                (userPresence: LivePresenceUser<IUserData>, local) => {
                    console.log(
                        "usePresence: presence received",
                        userPresence,
                        local
                    );
                    if (local) {
                        // Get the roles of the local user
                        userPresence
                            .getRoles()
                            .then((roles: UserMeetingRole[]) => {
                                setLocalUserRoles(roles);
                                setLocalUser(userPresence);
                            })
                            .catch((err) => {
                                console.error(
                                    "usePresence: getRoles error",
                                    err
                                );
                                // Set local user state
                                setLocalUser(userPresence);
                            });
                    }
                    // Set users local state
                    const userArray =
                        presence.toArray() as LivePresenceUser<IUserData>[];
                    setUsers(userArray);
                }
            );
            const userPrincipalName =
                context?.user?.userPrincipalName ?? "someone@contoso.com";
            const name = `@${userPrincipalName.split("@")[0]}`;
            // Start presence tracking
            console.log(
                "usePresence: starting presence for userId",
                context?.user?.id,
                context?.user?.displayName
            );

            const userData: IUserData = {
                teamsUserId: context.user?.id,
                joinedTimestamp: LiveEvent.getTimestamp(),
                name,
            };

            presence
                .initialize(context.user?.id, userData)
                .then(() => {
                    console.log("usePresence: started presence");
                    setStarted(true);
                })
                .catch((error) => console.error(error));
        }
    }, [presence, context, setUsers, setLocalUser]);

    return {
        presenceStarted,
        localUser,
        users,
        localUserIsEligiblePresenter,
    };
};
