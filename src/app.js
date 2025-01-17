const settings = {
    user: {
        chat: {
            enabled: false,
        },
        thumbnail_preview: false,
    },
    current_watch: {
        "id": "",
        "link": "",
        "title": "",
        "channel": "",
        "time": 0.0,
        "max_time": 0.0
    }
};

let vodSetup = false;

// Fetch user settings
chrome.storage.local.get(['user_settings'], function (result) {
    if (result.user_settings != undefined) {
        settings.user = JSON.parse(result.user_settings);
    }
});

// Need to inject libs for firefox
if (isFirefox()) {
    window.onload = () => {
        injectScript("src/scripts/video-7.20.2.min.js", () => {
            injectScript("src/scripts/silvermine-videojs-quality-selector.min.js", () => { });
        });
    }
}

// Listen when a sub only VOD is found
chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
    if (request.type === "load_vod") {
        if (vodSetup) {
            // If a VOD is already loaded reload the page
            // This prevent VOD to load twice
            location.reload();
        } else {
            checkSubOnlyVOD();
        }

        sendResponse({ success: true });
    }

    return true;
});

function checkSubOnlyVOD() {
    const currentURL = window.location.href.toString();

    if (!currentURL.includes("/videos/") && !currentURL.includes("/video/") && !vodSetup) {
        return;
    }

    vodSetup = true;

    console.log("[TwitchNoSub] Twitch VOD found");

    setTimeout(() => {
        // Check if the page contains Sub only VOD message
        let checkSub = document.querySelector("div[data-a-target='player-overlay-content-gate']");

        // If we don't find VOD
        if (!checkSub) {
            checkSub = undefined;

            // Some twitch VODs are just black ?
            // Check if there is a seek bar
            checkSub = document.querySelector("span[data-test-selector='seekbar-segment__segment']");

            if (checkSub) {
                console.log("[TwitchNoSub] This is not a sub-only VOD");

                checkSub = undefined;
            } else {
                // There is no seek bar, this is a sub-only VOD
                checkSub = document.querySelector(".persistent-player");
            }
        }

        if (checkSub) {
            console.log("[TwitchNoSub] Sub-only VOD found");
            // Replace sub only message with a loading gif
            checkSub.innerHTML = '<img src="https://i.ibb.co/NTpWgM1/Rolling-1s-200px.gif" alt="Loading VOD">';

            // Get the current twitch player
            const video = document.querySelector("div[class*=persistent-player]");
            const className = video.className;

            console.log("" + className);

            const vodID = window.location.toString().split("/").pop();

            settings.current_watch["link"] = vodID;

            setTimeout(() => {
                // Remove the current player
                video.remove();

                // Add on click event on every left tab channels
                document.querySelectorAll("a[data-test-selector*='followed-channel']").forEach(element => {
                    element.addEventListener("click", onClick);
                });

                // Add on click event on every vods
                document.querySelectorAll("img[src*='vods/']").forEach(element => {
                    element.addEventListener("click", onClick);
                });

                retrieveVOD(className);
            }, 1000);
        }
    }, 1500);
}

function retrieveVOD(className) {
    let currentURL = window.location.toString();

    // If the URL contains queries, remove them
    if (currentURL.includes("?")) {
        currentURL = currentURL.split("?")[0];
    }

    const vod_id = currentURL.split("/").pop();

    let seeked = false;
    var player = null;

    fetchTwitchData(vod_id, (data) => {
        console.log(data);

        const resolutions = data.resolutions;

        console.log("[TwitchNoSub] Start retrieving VOD links");
        console.log("[TwitchNoSub] VOD resolutions : " + JSON.stringify(resolutions));

        const currentURL = new URL(data.animated_preview_url);

        const domain = currentURL.host;
        const paths = currentURL.pathname.split("/");
        const vodSpecialID = paths[paths.findIndex(element => element.includes("storyboards")) - 1];

        console.log("[TwitchNoSub] VOD ID : " + vodSpecialID);
        console.log("[TwitchNoSub] VOD type : " + data.broadcast_type);

        let sources_ = [];

        switch (data.broadcast_type) {
            case "highlight":
                Object.entries(resolutions).map(([resKey, _]) => {
                    sources_.push({
                        src: `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vod_id}.m3u8`,
                        type: "application/x-mpegURL",
                        label: resKey == "chunked" ? "Source" : resKey,
                        selected: resKey == "chunked" ? true : false
                    });
                });

                break;
            case "upload":
                Object.entries(resolutions).map(([resKey, _]) => {
                    //TODO: Select the default quality in a better way
                    sources_.push({
                        src: `https://${domain}/${data.channel.name}/${vod_id}/${vodSpecialID}/${resKey}/index-dvr.m3u8`,
                        type: "application/x-mpegURL",
                        label: resKey == "chunked" ? "Source" : resKey,
                        selected: resKey == "chunked" ? true : false
                    });
                });

                break;
            default:// Default vod type archive
                Object.entries(resolutions).map(([resKey, _]) => {
                    sources_.push({
                        src: `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`,
                        type: "application/x-mpegURL",
                        label: resKey == "chunked" ? "Source" : resKey,
                        selected: resKey == "chunked" ? true : false
                    });
                });
                break;
        }

        console.log(sources_);

        // Insert the new video player
        const contentStream = document.querySelector("div[data-target='persistent-player-content']");
        contentStream.innerHTML = `
            <div preload="auto" class="video-js vjs-16-9 vjs-big-play-centered vjs-controls-enabled vjs-workinghover vjs-v7 player-dimensions vjs-has-started vjs-paused 
                    vjs-user-inactive ${className}" id="player" tabindex="-1" lang="en" role="region" aria-label="Video Player">
                <video id="video" class="vjs-tech vjs-matrix" controls>
                </video>
            </div>
            `;

        const onPlayerReady = () => {
            console.log("[TwitchNoSub] Player is ready");
            console.log(player);

            player.play();

            console.log("Duration : " + player.duration());

            if (settings.user.thumbnail_preview) {
                try {
                    setupThumbnails(player, "https://" + domain + "/" + vodSpecialID + "/storyboards/" + vod_id + "-low-0.jpg");
                } catch (e) {
                    console.log(e);
                }
            }

            settings.current_watch["title"] = data.title;
            settings.current_watch["channel"] = data.channel.name;
            settings.current_watch["id"] = vodSpecialID;
            settings.current_watch["max_time"] = player.currentTime() + player.remainingTime();

            // Fetch current VOD time from background (local storage)
            chrome.runtime.sendMessage({ type: "fetch_data", id: vodSpecialID }, function (response) {
                if (response.success) {
                    settings.current_watch["time"] = response.data["time"];

                    player.currentTime(settings.current_watch["time"]);
                }
            });

            // Fetch current volume from local storage
            const volume = window.localStorage.getItem("volume");

            if (volume != undefined) {
                player.volume(volume);
            }

            // Support for time query in URL (?t=1h15m56s)
            const params = (new URL(document.location)).searchParams;
            const time = params.get("t");

            if (time != undefined) {
                let final_time = 0;

                const first_split = time.split("h");
                let hours = parseInt(first_split[0]);
                const second_split = first_split[1].split("m");
                let minutes = parseInt(second_split[0]);
                let seconds = parseInt(second_split[1].replace("s", ""));

                final_time += (hours * 3600);
                final_time += (minutes * 60);
                final_time += seconds;

                player.currentTime(final_time);
            }

            // Save new volume in local storage
            player.on('volumechange', () => {
                window.localStorage.setItem("volume", player.muted() ? 0.0 : player.volume());
            });

            // Save new time in local storage
            player.on('timeupdate', () => {
                settings.current_watch["time"] = player.currentTime();

                chrome.runtime.sendMessage({ type: "update", id: vodSpecialID, data: settings.current_watch }, function (response) { });
            });

            // User moved forward or backard in the VOD
            player.on('seeked', () => {
                seeked = true;
            });

            if (isFirefox()) {
                // Fix full screen max height
                document.querySelectorAll(".channel-page__video-player").forEach(p => {
                    p.setAttribute("style", "max-height: 100vh !important");
                });
            }
        };

        // Init the player
        if (isFirefox()) {
            //Don't know why firefox only work with this
            window.eval(`
                videojs.Hls.xhr.beforeRequest = function (options) {
                    options.uri = options.uri.replace('unmuted.ts', 'muted.ts');
                    return options;
                };

                const player = videojs('video', {
                    playbackRates: [0.5, 1, 1.25, 1.5, 2],
                    controlBar: {
                        children: [
                            'playToggle',
                            'volumePanel',
                            'progressControl',
                            'currentTimeDisplay',
                            'spacer',
                            'PlaybackRateMenuButton',
                            'qualitySelector',
                            'fullscreenToggle',
                        ],
                    },
                    sources: ${JSON.stringify(sources_)}
                });
            `);

            // It's impossible to use videojs player in firefox extension
            // We use default Video API instead
            player = new MediaAPI(document.querySelector('video'));

            player.on("loadeddata", () => {
                onPlayerReady();
            });
        } else {
            // Patch the m3u8 VOD file to be readable
            videojs.Hls.xhr.beforeRequest = function (options) {
                options.uri = options.uri.replace('unmuted.ts', 'muted.ts');
                return options;
            };

            player = videojs('video', {
                playbackRates: [0.5, 1, 1.25, 1.5, 2],
                controlBar: {
                    children: [
                        'playToggle',
                        'volumePanel',
                        'progressControl',
                        'currentTimeDisplay',
                        'spacer',
                        'PlaybackRateMenuButton',
                        'qualitySelector',
                        'fullscreenToggle',
                        'thumbnail',
                    ],
                }
            });

            player.src(sources_);

            isReady = setInterval(() => {
                if (player.isReady_) {
                    clearInterval(isReady);
                    onPlayerReady();
                }
            }, 500);
        }

        // Add custom class on video player to have a perfect size on all screen
        player.addClass('channel-page__video-player');

        document.addEventListener('keydown', (event) => {
            const name = event.key;

            // Backward and forward with arrow keys
            if (name == "ArrowLeft") {
                player.currentTime(player.currentTime() - 5);
            } else if (name == "ArrowRight") {
                player.currentTime(player.currentTime() + 5);
            }

            if (name == " ") {
                event.preventDefault();

                if (player.paused()) {
                    player.play();
                } else {
                    player.pause();
                }
            }
        }, false);

        // Chat
        if (!settings.user.chat.enabled || data.broadcast_type == "upload") {
            return;
        }

        setTimeout(async () => {
            let index = 0;

            let messages = {
                comments: []
            };

            messages = await fetchChat(vod_id, player.currentTime(), undefined);

            setInterval(async () => {
                if (!player.paused() && (messages != undefined && messages.comments.length > 0) && settings.user.chat.enabled) {
                    if (seeked) {
                        seeked = false;

                        // If seeked reset the current chat cursor
                        messages = await fetchChat(vod_id, player.currentTime(), undefined);
                        index = 0;

                        return;
                    }

                    if (messages.comments.length <= index) {
                        messages = await fetchChat(vod_id, player.currentTime(), messages._next);
                        index = 0;
                    }

                    messages.comments.forEach(comment => {
                        if (comment.content_offset_seconds <= player.currentTime()) {
                            addMessage(comment);
                            delete messages.comments[index];
                            index++;
                        }
                    });
                }
            }, 1000);
        }, 1200);
    });
}

// Fetch data from Twitch API for the VOD
function fetchTwitchData(vodID, success) {
    fetch("https://api.twitch.tv/kraken/videos/" + vodID, {
        method: 'GET',
        headers: {
            'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(response => response.json()).then(data => { success(data); });
}

// Refresh current page on click to remove the extension player
function onClick() {
    setTimeout(() => {
        document.location.reload();
    }, 200);
}

function isFirefox() {
    return window.navigator.userAgent.includes("Firefox");
}

function injectScript(path, callback) {
    var s = document.createElement('script');
    s.src = chrome.runtime.getURL(path);
    s.onload = () => {
        callback();
    };
    (document.head || document.documentElement).appendChild(s);
}

function injectJavascriptCode(code) {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.text = code;
    (document.head || document.documentElement).appendChild(s);
}