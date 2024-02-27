/*! @name m3u8-parser @version 4.3.0 @license Apache-2.0 */
(function (global, factory) {
    factory(global);
}(this, (function (exports) {
    'use strict';
    class Stream {
        constructor() {
            this.listeners = {};
        }
        on(type, listener) {
            if (!this.listeners[type]) {
                this.listeners[type] = [];
            }

            this.listeners[type].push(listener);
        }
        off(type, listener) {
            if (!this.listeners[type]) {
                return false;
            }

            var index = this.listeners[type].indexOf(listener);
            this.listeners[type].splice(index, 1);
            return index > -1;
        }
        trigger(type) {
            var callbacks = this.listeners[type];
            var i;
            var length;
            var args;

            if (!callbacks) {
                return;
            } // Slicing the arguments on every invocation of this method
            // can add a significant amount of overhead. Avoid the
            // intermediate object creation for the common case of a
            // single callback argument


            if (arguments.length === 2) {
                length = callbacks.length;

                for (i = 0; i < length; ++i) {
                    callbacks[i].call(this, arguments[1]);
                }
            } else {
                args = Array.prototype.slice.call(arguments, 1);
                length = callbacks.length;

                for (i = 0; i < length; ++i) {
                    callbacks[i].apply(this, args);
                }
            }
        }
        dispose() {
            this.listeners = {};
        }
        pipe(destination) {
            this.on('data', function (data) {
                destination.push(data);
            });
        }
    }
    class LineStream extends Stream {
        constructor() {
            super();
            this.buffer = '';

        }
        push(data) {
            var nextNewline;
            this.buffer += data;
            nextNewline = this.buffer.indexOf('\n');

            for (; nextNewline > -1; nextNewline = this.buffer.indexOf('\n')) {
                this.trigger('data', this.buffer.substring(0, nextNewline));
                this.buffer = this.buffer.substring(nextNewline + 1);
            }
        }
    }
    function attributeSeparator() {
        var key = '[^=]*';
        var value = '"[^"]*"|[^,]*';
        var keyvalue = '(?:' + key + ')=(?:' + value + ')';
        return new RegExp('(?:^|,)(' + keyvalue + ')');
    };
    function parseAttributes(attributes) {
        // split the string using attributes as the separator
        var attrs = attributes.split(attributeSeparator());
        var result = {};
        var i = attrs.length;
        var attr;

        while (i--) {
            // filter out unmatched portions of the string
            if (attrs[i] === '') {
                continue;
            } // split the key and value


            attr = /([^=]*)=(.*)/.exec(attrs[i]).slice(1); // trim whitespace and remove optional quotes around the value

            attr[0] = attr[0].replace(/^\s+|\s+$/g, '');
            attr[1] = attr[1].replace(/^\s+|\s+$/g, '');
            attr[1] = attr[1].replace(/^['"](.*)['"]$/g, '$1');
            result[attr[0]] = attr[1];
        }

        return result;
    };
    class ParseStream extends Stream {
        constructor() {
            super();
            this.customParsers = [];
            this.tagMappers = [];
        }
        push(line) {
            var _this2 = this;

            var match;
            var event; // strip whitespace

            line = line.trim();

            if (line.length === 0) {
                // ignore empty lines
                return;
            } // URIs


            if (line[0] !== '#') {
                this.trigger('data', {
                    type: 'uri',
                    uri: line
                });
                return;
            } // map tags


            var newLines = this.tagMappers.reduce(function (acc, mapper) {
                var mappedLine = mapper(line); // skip if unchanged

                if (mappedLine === line) {
                    return acc;
                }

                return acc.concat([mappedLine]);
            }, [line]);
            newLines.forEach(function (newLine) {
                for (var i = 0; i < _this2.customParsers.length; i++) {
                    if (_this2.customParsers[i].call(_this2, newLine)) {
                        return;
                    }
                } // Comments


                if (newLine.indexOf('#EXT') !== 0) {
                    _this2.trigger('data', {
                        type: 'comment',
                        text: newLine.slice(1)
                    });

                    return;
                } // strip off any carriage returns here so the regex matching
                // doesn't have to account for them.


                newLine = newLine.replace('\r', ''); // Tags

                match = /^#EXTM3U/.exec(newLine);

                if (match) {
                    _this2.trigger('data', {
                        type: 'tag',
                        tagType: 'm3u'
                    });

                    return;
                }

                match = /^#EXTINF:?([0-9\.]*)?,?(.*)?$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'inf'
                    };

                    if (match[1]) {
                        event.duration = parseFloat(match[1]);
                    }

                    if (match[2]) {
                        event.title = match[2];
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-TARGETDURATION:?([0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'targetduration'
                    };

                    if (match[1]) {
                        event.duration = parseInt(match[1], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#ZEN-TOTAL-DURATION:?([0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'totalduration'
                    };

                    if (match[1]) {
                        event.duration = parseInt(match[1], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-VERSION:?([0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'version'
                    };

                    if (match[1]) {
                        event.version = parseInt(match[1], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-MEDIA-SEQUENCE:?(\-?[0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'media-sequence'
                    };

                    if (match[1]) {
                        event.number = parseInt(match[1], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-DISCONTINUITY-SEQUENCE:?(\-?[0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'discontinuity-sequence'
                    };

                    if (match[1]) {
                        event.number = parseInt(match[1], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-PLAYLIST-TYPE:?(.*)?$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'playlist-type'
                    };

                    if (match[1]) {
                        event.playlistType = match[1];
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-BYTERANGE:?([0-9.]*)?@?([0-9.]*)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'byterange'
                    };

                    if (match[1]) {
                        event.length = parseInt(match[1], 10);
                    }

                    if (match[2]) {
                        event.offset = parseInt(match[2], 10);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-ALLOW-CACHE:?(YES|NO)?/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'allow-cache'
                    };

                    if (match[1]) {
                        event.allowed = !/NO/.test(match[1]);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-MAP:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'map'
                    };

                    if (match[1]) {
                        var attributes = parseAttributes(match[1]);

                        if (attributes.URI) {
                            event.uri = attributes.URI;
                        }

                        if (attributes.BYTERANGE) {
                            var _attributes$BYTERANGE = attributes.BYTERANGE.split('@'),
                                length = _attributes$BYTERANGE[0],
                                offset = _attributes$BYTERANGE[1];

                            event.byterange = {};

                            if (length) {
                                event.byterange.length = parseInt(length, 10);
                            }

                            if (offset) {
                                event.byterange.offset = parseInt(offset, 10);
                            }
                        }
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-STREAM-INF:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'stream-inf'
                    };

                    if (match[1]) {
                        event.attributes = parseAttributes(match[1]);

                        if (event.attributes.RESOLUTION) {
                            var split = event.attributes.RESOLUTION.split('x');
                            var resolution = {};

                            if (split[0]) {
                                resolution.width = parseInt(split[0], 10);
                            }

                            if (split[1]) {
                                resolution.height = parseInt(split[1], 10);
                            }

                            event.attributes.RESOLUTION = resolution;
                        }

                        if (event.attributes.BANDWIDTH) {
                            event.attributes.BANDWIDTH = parseInt(event.attributes.BANDWIDTH, 10);
                        }

                        if (event.attributes['PROGRAM-ID']) {
                            event.attributes['PROGRAM-ID'] = parseInt(event.attributes['PROGRAM-ID'], 10);
                        }
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-MEDIA:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'media'
                    };

                    if (match[1]) {
                        event.attributes = parseAttributes(match[1]);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-ENDLIST/.exec(newLine);

                if (match) {
                    _this2.trigger('data', {
                        type: 'tag',
                        tagType: 'endlist'
                    });

                    return;
                }

                match = /^#EXT-X-DISCONTINUITY/.exec(newLine);

                if (match) {
                    _this2.trigger('data', {
                        type: 'tag',
                        tagType: 'discontinuity'
                    });

                    return;
                }

                match = /^#EXT-X-PROGRAM-DATE-TIME:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'program-date-time'
                    };

                    if (match[1]) {
                        event.dateTimeString = match[1];
                        event.dateTimeObject = new Date(match[1]);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-KEY:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'key'
                    };

                    if (match[1]) {
                        event.attributes = parseAttributes(match[1]); // parse the IV string into a Uint32Array

                        if (event.attributes.IV) {
                            if (event.attributes.IV.substring(0, 2).toLowerCase() === '0x') {
                                event.attributes.IV = event.attributes.IV.substring(2);
                            }

                            event.attributes.IV = event.attributes.IV.match(/.{8}/g);
                            event.attributes.IV[0] = parseInt(event.attributes.IV[0], 16);
                            event.attributes.IV[1] = parseInt(event.attributes.IV[1], 16);
                            event.attributes.IV[2] = parseInt(event.attributes.IV[2], 16);
                            event.attributes.IV[3] = parseInt(event.attributes.IV[3], 16);
                            event.attributes.IV = new Uint32Array(event.attributes.IV);
                        }
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-START:?(.*)$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'start'
                    };

                    if (match[1]) {
                        event.attributes = parseAttributes(match[1]);
                        event.attributes['TIME-OFFSET'] = parseFloat(event.attributes['TIME-OFFSET']);
                        event.attributes.PRECISE = /YES/.test(event.attributes.PRECISE);
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-CUE-OUT-CONT:?(.*)?$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'cue-out-cont'
                    };

                    if (match[1]) {
                        event.data = match[1];
                    } else {
                        event.data = '';
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-CUE-OUT:?(.*)?$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'cue-out'
                    };

                    if (match[1]) {
                        event.data = match[1];
                    } else {
                        event.data = '';
                    }

                    _this2.trigger('data', event);

                    return;
                }

                match = /^#EXT-X-CUE-IN:?(.*)?$/.exec(newLine);

                if (match) {
                    event = {
                        type: 'tag',
                        tagType: 'cue-in'
                    };

                    if (match[1]) {
                        event.data = match[1];
                    } else {
                        event.data = '';
                    }

                    _this2.trigger('data', event);

                    return;
                } // unknown tag type


                _this2.trigger('data', {
                    type: 'tag',
                    data: newLine.slice(4)
                });
            });
        }
        addParser(_ref) {
            var _this3 = this;

            var expression = _ref.expression,
                customType = _ref.customType,
                dataParser = _ref.dataParser,
                segment = _ref.segment;

            if (typeof dataParser !== 'function') {
                dataParser = function dataParser(line) {
                    return line;
                };
            }

            this.customParsers.push(function (line) {
                var match = expression.exec(line);

                if (match) {
                    _this3.trigger('data', {
                        type: 'custom',
                        data: dataParser(line),
                        customType: customType,
                        segment: segment
                    });

                    return true;
                }
            });
        }
        addTagMapper(_ref2) {
            var expression = _ref2.expression,
                map = _ref2.map;

            var mapFn = function mapFn(line) {
                if (expression.test(line)) {
                    return map(line);
                }

                return line;
            };

            this.tagMappers.push(mapFn);
        }
    }
    class Parser extends Stream {
        constructor(text) {
            super();
            const _this = this;
            _this.lineStream = new LineStream();
            _this.parseStream = new ParseStream();

            _this.lineStream.pipe(_this.parseStream);
            /* eslint-disable consistent-this */
            /* eslint-enable consistent-this */


            var uris = [];
            var currentUri = {}; // if specified, the active EXT-X-MAP definition

            var currentMap; // if specified, the active decryption key

            var _key;

            var noop = function noop() {};

            var defaultMediaGroups = {
                'AUDIO': {},
                'VIDEO': {},
                'CLOSED-CAPTIONS': {},
                'SUBTITLES': {}
            }; // group segments into numbered timelines delineated by discontinuities

            var currentTimeline = 0; // the manifest is empty until the parse stream begins delivering data

            _this.manifest = {
                allowCache: true,
                discontinuityStarts: [],
                segments: []
            }; // update the manifest with the m3u8 entry from the parse stream

            _this.parseStream.on('data', function (entry) {
                var mediaGroup;
                var rendition;
                ({
                    tag: function tag() {
                        // switch based on the tag type
                        (({
                            'allow-cache': function allowCache() {
                                this.manifest.allowCache = entry.allowed;

                                if (!('allowed' in entry)) {
                                    this.trigger('info', {
                                        message: 'defaulting allowCache to YES'
                                    });
                                    this.manifest.allowCache = true;
                                }
                            },
                            byterange: function byterange() {
                                var byterange = {};

                                if ('length' in entry) {
                                    currentUri.byterange = byterange;
                                    byterange.length = entry.length;

                                    if (!('offset' in entry)) {
                                        this.trigger('info', {
                                            message: 'defaulting offset to zero'
                                        });
                                        entry.offset = 0;
                                    }
                                }

                                if ('offset' in entry) {
                                    currentUri.byterange = byterange;
                                    byterange.offset = entry.offset;
                                }
                            },
                            endlist: function endlist() {
                                this.manifest.endList = true;
                            },
                            inf: function inf() {
                                if (!('mediaSequence' in this.manifest)) {
                                    this.manifest.mediaSequence = 0;
                                    this.trigger('info', {
                                        message: 'defaulting media sequence to zero'
                                    });
                                }

                                if (!('discontinuitySequence' in this.manifest)) {
                                    this.manifest.discontinuitySequence = 0;
                                    this.trigger('info', {
                                        message: 'defaulting discontinuity sequence to zero'
                                    });
                                }

                                if (entry.duration > 0) {
                                    currentUri.duration = entry.duration;
                                }

                                if (entry.duration === 0) {
                                    currentUri.duration = 0.01;
                                    this.trigger('info', {
                                        message: 'updating zero segment duration to a small value'
                                    });
                                }

                                this.manifest.segments = uris;
                            },
                            key: function key() {
                                if (!entry.attributes) {
                                    this.trigger('warn', {
                                        message: 'ignoring key declaration without attribute list'
                                    });
                                    return;
                                } // clear the active encryption key


                                if (entry.attributes.METHOD === 'NONE') {
                                    _key = null;
                                    return;
                                }

                                if (!entry.attributes.URI) {
                                    this.trigger('warn', {
                                        message: 'ignoring key declaration without URI'
                                    });
                                    return;
                                }

                                if (!entry.attributes.METHOD) {
                                    this.trigger('warn', {
                                        message: 'defaulting key method to AES-128'
                                    });
                                } // setup an encryption key for upcoming segments


                                _key = {
                                    method: entry.attributes.METHOD || 'AES-128',
                                    uri: entry.attributes.URI
                                };

                                if (typeof entry.attributes.IV !== 'undefined') {
                                    _key.iv = entry.attributes.IV;
                                }
                            },
                            'media-sequence': function mediaSequence() {
                                if (!isFinite(entry.number)) {
                                    this.trigger('warn', {
                                        message: 'ignoring invalid media sequence: ' + entry.number
                                    });
                                    return;
                                }

                                this.manifest.mediaSequence = entry.number;
                            },
                            'discontinuity-sequence': function discontinuitySequence() {
                                if (!isFinite(entry.number)) {
                                    this.trigger('warn', {
                                        message: 'ignoring invalid discontinuity sequence: ' + entry.number
                                    });
                                    return;
                                }

                                this.manifest.discontinuitySequence = entry.number;
                                currentTimeline = entry.number;
                            },
                            'playlist-type': function playlistType() {
                                if (!/VOD|EVENT/.test(entry.playlistType)) {
                                    this.trigger('warn', {
                                        message: 'ignoring unknown playlist type: ' + entry.playlist
                                    });
                                    return;
                                }

                                this.manifest.playlistType = entry.playlistType;
                            },
                            map: function map() {
                                currentMap = {};

                                if (entry.uri) {
                                    currentMap.uri = entry.uri;
                                }

                                if (entry.byterange) {
                                    currentMap.byterange = entry.byterange;
                                }
                            },
                            'stream-inf': function streamInf() {
                                this.manifest.playlists = uris;
                                this.manifest.mediaGroups = this.manifest.mediaGroups || defaultMediaGroups;

                                if (!entry.attributes) {
                                    this.trigger('warn', {
                                        message: 'ignoring empty stream-inf attributes'
                                    });
                                    return;
                                }

                                if (!currentUri.attributes) {
                                    currentUri.attributes = {};
                                }

                                Object.assign(currentUri.attributes, entry.attributes);
                            },
                            media: function media() {
                                this.manifest.mediaGroups = this.manifest.mediaGroups || defaultMediaGroups;

                                if (!(entry.attributes && entry.attributes.TYPE && entry.attributes['GROUP-ID'] && entry.attributes.NAME)) {
                                    this.trigger('warn', {
                                        message: 'ignoring incomplete or missing media group'
                                    });
                                    return;
                                } // find the media group, creating defaults as necessary


                                var mediaGroupType = this.manifest.mediaGroups[entry.attributes.TYPE];
                                mediaGroupType[entry.attributes['GROUP-ID']] = mediaGroupType[entry.attributes['GROUP-ID']] || {};
                                mediaGroup = mediaGroupType[entry.attributes['GROUP-ID']]; // collect the rendition metadata

                                rendition = {
                                    default: /yes/i.test(entry.attributes.DEFAULT)
                                };

                                if (rendition.default) {
                                    rendition.autoselect = true;
                                } else {
                                    rendition.autoselect = /yes/i.test(entry.attributes.AUTOSELECT);
                                }

                                if (entry.attributes.LANGUAGE) {
                                    rendition.language = entry.attributes.LANGUAGE;
                                }

                                if (entry.attributes.URI) {
                                    rendition.uri = entry.attributes.URI;
                                }

                                if (entry.attributes['INSTREAM-ID']) {
                                    rendition.instreamId = entry.attributes['INSTREAM-ID'];
                                }

                                if (entry.attributes.CHARACTERISTICS) {
                                    rendition.characteristics = entry.attributes.CHARACTERISTICS;
                                }

                                if (entry.attributes.FORCED) {
                                    rendition.forced = /yes/i.test(entry.attributes.FORCED);
                                } // insert the new rendition


                                mediaGroup[entry.attributes.NAME] = rendition;
                            },
                            discontinuity: function discontinuity() {
                                currentTimeline += 1;
                                currentUri.discontinuity = true;
                                this.manifest.discontinuityStarts.push(uris.length);
                            },
                            'program-date-time': function programDateTime() {
                                if (typeof this.manifest.dateTimeString === 'undefined') {
                                    // PROGRAM-DATE-TIME is a media-segment tag, but for backwards
                                    // compatibility, we add the first occurence of the PROGRAM-DATE-TIME tag
                                    // to the manifest object
                                    // TODO: Consider removing this in future major version
                                    this.manifest.dateTimeString = entry.dateTimeString;
                                    this.manifest.dateTimeObject = entry.dateTimeObject;
                                }

                                currentUri.dateTimeString = entry.dateTimeString;
                                currentUri.dateTimeObject = entry.dateTimeObject;
                            },
                            targetduration: function targetduration() {
                                if (!isFinite(entry.duration) || entry.duration < 0) {
                                    this.trigger('warn', {
                                        message: 'ignoring invalid target duration: ' + entry.duration
                                    });
                                    return;
                                }

                                this.manifest.targetDuration = entry.duration;
                            },
                            totalduration: function totalduration() {
                                if (!isFinite(entry.duration) || entry.duration < 0) {
                                    this.trigger('warn', {
                                        message: 'ignoring invalid total duration: ' + entry.duration
                                    });
                                    return;
                                }

                                this.manifest.totalDuration = entry.duration;
                            },
                            start: function start() {
                                if (!entry.attributes || isNaN(entry.attributes['TIME-OFFSET'])) {
                                    this.trigger('warn', {
                                        message: 'ignoring start declaration without appropriate attribute list'
                                    });
                                    return;
                                }

                                this.manifest.start = {
                                    timeOffset: entry.attributes['TIME-OFFSET'],
                                    precise: entry.attributes.PRECISE
                                };
                            },
                            'cue-out': function cueOut() {
                                currentUri.cueOut = entry.data;
                            },
                            'cue-out-cont': function cueOutCont() {
                                currentUri.cueOutCont = entry.data;
                            },
                            'cue-in': function cueIn() {
                                currentUri.cueIn = entry.data;
                            }
                        })[entry.tagType] || noop).call(_this);
                    },
                    uri: function uri() {
                        currentUri.uri = entry.uri;
                        uris.push(currentUri); // if no explicit duration was declared, use the target duration

                        if (this.manifest.targetDuration && !('duration' in currentUri)) {
                            this.trigger('warn', {
                                message: 'defaulting segment duration to the target duration'
                            });
                            currentUri.duration = this.manifest.targetDuration;
                        } // annotate with encryption information, if necessary


                        if (_key) {
                            currentUri.key = _key;
                        }

                        currentUri.timeline = currentTimeline; // annotate with initialization segment information, if necessary

                        if (currentMap) {
                            currentUri.map = currentMap;
                        } // prepare for the next URI


                        currentUri = {};
                    },
                    comment: function comment() { // comments are not important for playback
                    },
                    custom: function custom() {
                        // if this is segment-level data attach the output to the segment
                        if (entry.segment) {
                            currentUri.custom = currentUri.custom || {};
                            currentUri.custom[entry.customType] = entry.data; // if this is manifest-level data attach to the top level manifest object
                        } else {
                            this.manifest.custom = this.manifest.custom || {};
                            this.manifest.custom[entry.customType] = entry.data;
                        }
                    }
                })[entry.type].call(_this);
            });
            if(text){
                this.push(text);
            }
        }
        push(chunk) {
            this.lineStream.push(chunk);
        }
        end() {
            // flush any buffered input
            this.lineStream.push('\n');
        }
        addParser(options) {
            this.parseStream.addParser(options);
        }
        addTagMapper(options) {
            this.parseStream.addTagMapper(options);
        }
    }
    Object.assign(exports,{m3u8parser:Parser});
})));