/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { useEffect, useState, useRef, FC } from "react";
import { getFlexColumnStyles } from "../styles/layouts";
import { mergeClasses } from "@fluentui/react-components";
import { getLiveNotificationStyles, getPillStyles } from "../styles/styles";
import React from "react";

interface Notification {
    id: string;
    text: string;
}

export const LiveNotifications: FC<{ notificationToDisplay?: string }> = ({
    notificationToDisplay,
}) => {
    const notificationsRef = useRef<Notification[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    useEffect(() => {
        if (notificationToDisplay) {
            // Display the notification
            const updatedNotifications: Notification[] = [
                ...notificationsRef.current,
            ];
            const notificationId = `notification${Math.abs(
                Math.random() * 999999999
            )}`;
            updatedNotifications.push({
                id: notificationId,
                text: notificationToDisplay,
            });
            notificationsRef.current = updatedNotifications;
            setNotifications(notificationsRef.current);

            // Remove the notification after a 1s delay
            setTimeout(() => {
                const resetNotifications = [...notificationsRef.current];
                const matchIndex = resetNotifications.findIndex(
                    (notification) => notification.id === notificationId
                );
                if (matchIndex >= 0) {
                    resetNotifications.splice(matchIndex, 1);
                    notificationsRef.current = resetNotifications;
                    setNotifications(notificationsRef.current);
                }
            }, 1500);
        }
    }, [notificationToDisplay, setNotifications]);

    const flexColumnStyles = getFlexColumnStyles();
    const pillStyles = getPillStyles();
    const liveNotifications = getLiveNotificationStyles();

    return (
        <div
            className={mergeClasses(
                flexColumnStyles.root,
                flexColumnStyles.hAlignCenter,
                liveNotifications.root
            )}
        >
            {notifications.map((notification) => {
                return (
                    <div
                        className={mergeClasses(pillStyles.root)}
                        key={notification.id}
                    >
                        {notification.text}
                    </div>
                );
            })}
        </div>
    );
};
