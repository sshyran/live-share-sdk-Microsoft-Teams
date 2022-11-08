/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { Slider } from "@fluentui/react-components";
import { Tooltip } from "@fluentui/react-components";
import { getProgressBarStyles } from "../styles/styles";
import { debounce } from "lodash";
import { getFlexItemStyles } from "../styles/layouts";
import { formatTimeValue } from "../utils/format";

let previousXPos = 0;

const PlayerProgressBar = memo(
    ({ currentTime, duration, isPlaybackDisabled, videoSize, onSeek }) => {
        const toolTipPositioningRef = useRef();
        const sliderRef = useRef();
        const dimensionRef = useRef();
        const [toolTipContent, setToolTipContent] = useState("0:00");

        const [localCurrentTime, setLocalCurrentTime] = useState(0);
        const [isSeeking, setIsSeeking] = useState(false);

        const styles = getProgressBarStyles();
        const flexItemStyles = getFlexItemStyles();

        const onDidSeek = useCallback(() => {
            onSeek(localCurrentTime);
            setTimeout(() => {
                setIsSeeking(false);
            }, 500);
        }, [onSeek, setIsSeeking, localCurrentTime]);

        // eslint-disable-next-line
        const debouncedSeek = useCallback(debounce(onDidSeek, 200), [
            onDidSeek,
            localCurrentTime,
        ]);

        useEffect(() => {
            if (!isSeeking && currentTime !== localCurrentTime) {
                setLocalCurrentTime(currentTime);
            }
        }, [currentTime, localCurrentTime, isSeeking]);

        useEffect(() => {
            if (
                sliderRef.current &&
                videoSize &&
                videoSize.width > 1 &&
                toolTipPositioningRef.current
            ) {
                dimensionRef.current =
                    sliderRef.current.getBoundingClientRect();
            }
        }, [sliderRef, duration, videoSize]);

        useEffect(() => {
            if (dimensionRef.current) {
                toolTipPositioningRef.current?.setTarget({
                    getBoundingClientRect: getRect(
                        previousXPos,
                        dimensionRef.current.top - 0
                    ),
                    positionFixed: true,
                });
            }
        });

        const onMouseMove = (e) => {
            if (dimensionRef.current) {
                const xPosition = Math.min(
                    Math.max(e.clientX, dimensionRef.current.left),
                    dimensionRef.current.right - 4
                );
                previousXPos = xPosition;
                const distanceFromOrigin =
                    xPosition - dimensionRef.current.left;
                const mousePos =
                    (distanceFromOrigin / dimensionRef.current.width) * 100;
                const hoverTime = Math.max(
                    0,
                    Math.min(Math.round(duration * (mousePos / 100)), duration)
                );
                const scrollOffSet = 0;

                setToolTipContent(formatTimeValue(hoverTime));

                toolTipPositioningRef.current?.setTarget({
                    getBoundingClientRect: getRect(
                        xPosition,
                        dimensionRef.current.top - scrollOffSet
                    ),
                    positionFixed: true,
                });
            }
        };

        const onTouchMove = (e) => {
            if (dimensionRef.current) {
                const xPosition = Math.min(
                    Math.max(
                        e.nativeEvent.touches[0].clientX,
                        dimensionRef.current.left
                    ),
                    dimensionRef.current.right - 4
                );
                previousXPos = xPosition;
                const distanceFromOrigin =
                    xPosition - dimensionRef.current.left;
                const mousePos =
                    (distanceFromOrigin / dimensionRef.current.width) * 100;
                const hoverTime = Math.max(
                    0,
                    Math.min(Math.round(duration * (mousePos / 100)), duration)
                );
                const scrollOffSet = 0;

                setToolTipContent(formatTimeValue(hoverTime));

                toolTipPositioningRef.current?.setTarget({
                    getBoundingClientRect: getRect(
                        xPosition,
                        dimensionRef.current.top - scrollOffSet
                    ),
                    positionFixed: true,
                });
            }
        };

        const durationToDivideBy = duration === 0 ? 100 : duration;
        const bufferLoadedPercent = 0;

        return (
            <div className={flexItemStyles.noShrink}>
                <div className={styles.pageEl}>
                    <Tooltip
                        withArrow
                        positioning={{ positioningRef: toolTipPositioningRef }}
                        content={toolTipContent}
                        relationship="label"
                    >
                        <Slider
                            root={{ ref: sliderRef }}
                            min={0}
                            max={durationToDivideBy}
                            value={localCurrentTime}
                            disabled={isPlaybackDisabled}
                            style={{
                                "--oneplayer-play-progress-percent": `${
                                    (localCurrentTime / durationToDivideBy) *
                                    100
                                }%`,
                                "--oneplayer-buff-progress-percent": `${
                                    ((duration * bufferLoadedPercent) /
                                        durationToDivideBy) *
                                    100
                                }%`,
                                "--fui-slider-thumb-size": "1rem",
                            }}
                            input={{
                                className: styles.input,
                                "aria-valuemin": 0,
                                "aria-valuemax": duration,
                                "aria-label": "progress bar",
                                "aria-live": "polite",
                                role: "slider",
                            }}
                            rail={{
                                className: styles.rail,
                            }}
                            className={styles.root}
                            thumb={{ className: styles.thumb }}
                            onChange={(ev, data) => {
                                setIsSeeking(true);
                                setLocalCurrentTime(data.value);
                            }}
                            onMouseMove={onMouseMove}
                            onMouseDown={() => {
                                setIsSeeking(true);
                            }}
                            onTouchStart={(e) => {
                                setIsSeeking(true);
                            }}
                            onTouchMove={onTouchMove}
                            onTouchEnd={(e) => {
                                debouncedSeek();
                            }}
                            onMouseUp={() => {
                                debouncedSeek();
                            }}
                        />
                    </Tooltip>
                </div>
            </div>
        );
    }
);

const getRect = (x = 0, y = 0) => {
    return () => ({
        width: 0,
        height: 0,
        top: y,
        right: x,
        bottom: y,
        left: x,
    });
};

PlayerProgressBar.displayName = "PlayerProgressBar";
export default PlayerProgressBar;
