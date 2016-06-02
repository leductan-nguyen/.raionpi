$(function() {
    function AppearanceViewModel(parameters) {
        var self = this;

        self.name = parameters[0].appearance_name;
        self.color = parameters[0].appearance_color;
        self.colorTransparent = parameters[0].appearance_colorTransparent;

        self.brand = ko.pureComputed(function() {
            if (self.name())
                return gettext("RaionPi") + ": " + self.name();
            else
                return gettext("RaionPi");
        });

        self.title = ko.pureComputed(function() {
            if (self.name())
                return self.name() + " [" + gettext("RaionPi") + "]";
            else
                return gettext("RaionPi");
        });
    }

    OCTOPRINT_VIEWMODELS.push([
        AppearanceViewModel,
        ["settingsViewModel"],
        "head"
    ]);
});

;

$(function() {
    function ConnectionViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.printerProfiles = parameters[2];

        self.printerProfiles.profiles.items.subscribe(function() {
            var allProfiles = self.printerProfiles.profiles.items();

            var printerOptions = [];
            _.each(allProfiles, function(profile) {
                printerOptions.push({id: profile.id, name: profile.name});
            });
            self.printerOptions(printerOptions);
        });

        self.printerProfiles.currentProfile.subscribe(function() {
            self.selectedPrinter(self.printerProfiles.currentProfile());
        });

        self.portOptions = ko.observableArray(undefined);
        self.baudrateOptions = ko.observableArray(undefined);
        self.printerOptions = ko.observableArray(undefined);
        self.selectedPort = ko.observable(undefined);
        self.selectedBaudrate = ko.observable(undefined);
        self.selectedPrinter = ko.observable(undefined);
        self.saveSettings = ko.observable(undefined);
        self.autoconnect = ko.observable(undefined);

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.buttonText = ko.pureComputed(function() {
            if (self.isErrorOrClosed())
                return gettext("Connect");
            else
                return gettext("Disconnect");
        });

        self.previousIsOperational = undefined;

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "connection",
                method: "GET",
                dataType: "json",
                success: function(response) {
                    self.fromResponse(response);
                }
            })
        };

        self.fromResponse = function(response) {
            var ports = response.options.ports;
            var baudrates = response.options.baudrates;
            var portPreference = response.options.portPreference;
            var baudratePreference = response.options.baudratePreference;
            var printerPreference = response.options.printerProfilePreference;
            var printerProfiles = response.options.printerProfiles;

            self.portOptions(ports);
            self.baudrateOptions(baudrates);

            if (!self.selectedPort() && ports && ports.indexOf(portPreference) >= 0)
                self.selectedPort(portPreference);
            if (!self.selectedBaudrate() && baudrates && baudrates.indexOf(baudratePreference) >= 0)
                self.selectedBaudrate(baudratePreference);
            if (!self.selectedPrinter() && printerProfiles && printerProfiles.indexOf(printerPreference) >= 0)
                self.selectedPrinter(printerPreference);

            self.saveSettings(false);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
        };

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
        };

        self.openOrCloseOnStateChange = function() {
            var connectionTab = $("#connection");
            if (self.isOperational() && connectionTab.hasClass("in")) {
                connectionTab.collapse("hide");
            } else if (!self.isOperational() && !connectionTab.hasClass("in")) {
                connectionTab.collapse("show");
            }
        }

        self._processStateData = function(data) {
            self.previousIsOperational = self.isOperational();

            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);

            if (self.loginState.isAdmin() && self.previousIsOperational != self.isOperational()) {
                // only open or close if the panel is visible (for admins) and
                // the state just changed to avoid thwarting manual open/close
                self.openOrCloseOnStateChange();
            }
        };

        self.connect = function() {
            if (self.isErrorOrClosed()) {
                var data = {
                    "command": "connect",
                    "port": self.selectedPort() || "AUTO",
                    "baudrate": self.selectedBaudrate() || 0,
                    "printerProfile": self.selectedPrinter(),
                    "autoconnect": self.settings.serial_autoconnect()
                };

                if (self.saveSettings())
                    data["save"] = true;

                $.ajax({
                    url: API_BASEURL + "connection",
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json; charset=UTF-8",
                    data: JSON.stringify(data),
                    success: function(response) {
                        self.settings.requestData();
                        self.settings.printerProfiles.requestData();
                    }
                });
            } else {
                self.requestData();
                $.ajax({
                    url: API_BASEURL + "connection",
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json; charset=UTF-8",
                    data: JSON.stringify({"command": "disconnect"})
                })
            }
        };

        self.onStartup = function() {
            self.requestData();

            // when isAdmin becomes true the first time, set the panel open or
            // closed based on the connection state
            var subscription = self.loginState.isAdmin.subscribe(function(newValue) {
                if (newValue) {
                    // wait until after the isAdmin state has run through all subscriptions
                    setTimeout(self.openOrCloseOnStateChange, 0);
                    subscription.dispose();
                }
            });
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        ConnectionViewModel,
        ["loginStateViewModel", "settingsViewModel", "printerProfilesViewModel"],
        "#connection_wrapper"
    ]);
});

;

$(function() {
    function ControlViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];

        // TODO remove with release of 1.3.0 and switch to RaionPi.coreui usage
        self.tabTracking = parameters[2];

        self._createToolEntry = function () {
            return {
                name: ko.observable(),
                key: ko.observable()
            }
        };

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.extrusionAmount = ko.observable(undefined);
        self.controls = ko.observableArray([]);

        self.distances = ko.observableArray([0.1, 1, 10, 100]);
        self.distance = ko.observable(10);

        self.tools = ko.observableArray([]);

        self.feedRate = ko.observable(100);
        self.flowRate = ko.observable(100);

        self.feedbackControlLookup = {};

        self.controlsFromServer = [];
        self.additionalControls = [];

        self.webcamDisableTimeout = undefined;

        self.keycontrolActive = ko.observable(false);
        self.keycontrolHelpActive = ko.observable(false);
        self.keycontrolPossible = ko.pureComputed(function () {
            return self.isOperational() && !self.isPrinting() && self.loginState.isUser() && !$.browser.mobile;
        });
        self.showKeycontrols = ko.pureComputed(function () {
            return self.keycontrolActive() && self.keycontrolPossible();
        });

        self.settings.printerProfiles.currentProfileData.subscribe(function () {
            self._updateExtruderCount();
            self.settings.printerProfiles.currentProfileData().extruder.count.subscribe(self._updateExtruderCount);
        });
        self._updateExtruderCount = function () {
            var tools = [];

            var numExtruders = self.settings.printerProfiles.currentProfileData().extruder.count();
            if (numExtruders > 1) {
                // multiple extruders
                for (var extruder = 0; extruder < numExtruders; extruder++) {
                    tools[extruder] = self._createToolEntry();
                    tools[extruder]["name"](gettext("Tool") + " " + extruder);
                    tools[extruder]["key"]("tool" + extruder);
                }
            } else {
                // only one extruder, no need to add numbers
                tools[0] = self._createToolEntry();
                tools[0]["name"](gettext("Hotend"));
                tools[0]["key"]("tool0");
            }

            self.tools(tools);
        };

        self.fromCurrentData = function (data) {
            self._processStateData(data.state);
        };

        self.fromHistoryData = function (data) {
            self._processStateData(data.state);
        };

        self._processStateData = function (data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self.onEventSettingsUpdated = function (payload) {
            self.requestData();
        };

        self.onEventRegisteredMessageReceived = function(payload) {
            if (payload.key in self.feedbackControlLookup) {
                var outputs = self.feedbackControlLookup[payload.key];
                _.each(payload.outputs, function(value, key) {
                    if (outputs.hasOwnProperty(key)) {
                        outputs[key](value);
                    }
                });
            }
        };

        self.rerenderControls = function () {
            var allControls = self.controlsFromServer.concat(self.additionalControls);
            self.controls(self._processControls(allControls))
        };

        self.requestData = function () {
            $.ajax({
                url: API_BASEURL + "printer/command/custom",
                method: "GET",
                dataType: "json",
                success: function (response) {
                    self._fromResponse(response);
                }
            });
        };

        self._fromResponse = function (response) {
            self.controlsFromServer = response.controls;
            self.rerenderControls();
        };

        self._processControls = function (controls) {
            for (var i = 0; i < controls.length; i++) {
                controls[i] = self._processControl(controls[i]);
            }
            return controls;
        };

        self._processControl = function (control) {
            if (control.hasOwnProperty("processed") && control.processed) {
                return control;
            }

            if (control.hasOwnProperty("template") && control.hasOwnProperty("key") && control.hasOwnProperty("template_key") && !control.hasOwnProperty("output")) {
                control.output = ko.observable(control.default || "");
                if (!self.feedbackControlLookup.hasOwnProperty(control.key)) {
                    self.feedbackControlLookup[control.key] = {};
                }
                self.feedbackControlLookup[control.key][control.template_key] = control.output;
            }

            if (control.hasOwnProperty("children")) {
                control.children = ko.observableArray(self._processControls(control.children));
                if (!control.hasOwnProperty("layout") || !(control.layout == "vertical" || control.layout == "horizontal" || control.layout == "horizontal_grid")) {
                    control.layout = "vertical";
                }

                if (!control.hasOwnProperty("collapsed")) {
                    control.collapsed = false;
                }
            }

            if (control.hasOwnProperty("input")) {
                var attributeToInt = function(obj, key, def) {
                    if (obj.hasOwnProperty(key)) {
                        var val = obj[key];
                        if (_.isNumber(val)) {
                            return val;
                        }

                        var parsedVal = parseInt(val);
                        if (!isNaN(parsedVal)) {
                            return parsedVal;
                        }
                    }
                    return def;
                };

                _.each(control.input, function (element) {
                    if (element.hasOwnProperty("slider") && _.isObject(element.slider)) {
                        element.slider["min"] = attributeToInt(element.slider, "min", 0);
                        element.slider["max"] = attributeToInt(element.slider, "max", 255);

                        // try defaultValue, default to min
                        var defaultValue = attributeToInt(element, "default", element.slider.min);

                        // if default value is not within range of min and max, correct that
                        if (!_.inRange(defaultValue, element.slider.min, element.slider.max)) {
                            // use bound closer to configured default value
                            defaultValue = defaultValue < element.slider.min ? element.slider.min : element.slider.max;
                        }

                        element.value = ko.observable(defaultValue);
                    } else {
                        element.slider = false;
                        element.value = ko.observable((element.hasOwnProperty("default")) ? element["default"] : undefined);
                    }
                });
            }

            var js;
            if (control.hasOwnProperty("javascript")) {
                js = control.javascript;

                // if js is a function everything's fine already, but if it's a string we need to eval that first
                if (!_.isFunction(js)) {
                    control.javascript = function (data) {
                        eval(js);
                    };
                }
            }

            if (control.hasOwnProperty("enabled")) {
                js = control.enabled;

                // if js is a function everything's fine already, but if it's a string we need to eval that first
                if (!_.isFunction(js)) {
                    control.enabled = function (data) {
                        return eval(js);
                    }
                }
            }

            control.processed = true;
            return control;
        };

        self.isCustomEnabled = function (data) {
            if (data.hasOwnProperty("enabled")) {
                return data.enabled(data);
            } else {
                return self.isOperational() && self.loginState.isUser();
            }
        };

        self.clickCustom = function (data) {
            var callback;
            if (data.hasOwnProperty("javascript")) {
                callback = data.javascript;
            } else {
                callback = self.sendCustomCommand;
            }

            if (data.confirm) {
                showConfirmationDialog(data.confirm, function (e) {
                    callback(data);
                });
            } else {
                callback(data);
            }
        };

        self.sendJogCommand = function (axis, multiplier, distance) {
            if (typeof distance === "undefined")
                distance = self.distance();
            if (self.settings.printerProfiles.currentProfileData() && self.settings.printerProfiles.currentProfileData()["axes"] && self.settings.printerProfiles.currentProfileData()["axes"][axis] && self.settings.printerProfiles.currentProfileData()["axes"][axis]["inverted"]()) {
                multiplier *= -1;
            }

            var data = {
                "command": "jog"
            };
            data[axis] = distance * multiplier;

            self.sendPrintHeadCommand(data);
        };

        self.sendHomeCommand = function (axis) {
            self.sendPrintHeadCommand({
                "command": "home",
                "axes": axis
            });
        };

        self.sendFeedRateCommand = function () {
            self.sendPrintHeadCommand({
                "command": "feedrate",
                "factor": self.feedRate()
            });
        };

        self.sendExtrudeCommand = function () {
            self._sendECommand(1);
        };

        self.sendRetractCommand = function () {
            self._sendECommand(-1);
        };

        self.sendFlowRateCommand = function () {
            self.sendToolCommand({
                "command": "flowrate",
                "factor": self.flowRate()
            });
        };

        self._sendECommand = function (dir) {
            var length = self.extrusionAmount();
            if (!length) length = self.settings.printer_defaultExtrusionLength();

            self.sendToolCommand({
                command: "extrude",
                amount: length * dir
            });
        };

        self.sendSelectToolCommand = function (data) {
            if (!data || !data.key()) return;

            self.sendToolCommand({
                command: "select",
                tool: data.key()
            });
        };

        self.sendPrintHeadCommand = function (data) {
            $.ajax({
                url: API_BASEURL + "printer/printhead",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });
        };

        self.sendToolCommand = function (data) {
            $.ajax({
                url: API_BASEURL + "printer/tool",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });
        };

        self.sendCustomCommand = function (command) {
            if (!command)
                return;

            var data = undefined;
            if (command.hasOwnProperty("command")) {
                // single command
                data = {"command": command.command};
            } else if (command.hasOwnProperty("commands")) {
                // multi command
                data = {"commands": command.commands};
            } else if (command.hasOwnProperty("script")) {
                data = {"script": command.script};
                if (command.hasOwnProperty("context")) {
                    data["context"] = command.context;
                }
            } else {
                return;
            }

            if (command.hasOwnProperty("input")) {
                // parametric command(s)
                data["parameters"] = {};
                _.each(command.input, function(input) {
                    if (!input.hasOwnProperty("parameter") || !input.hasOwnProperty("value")) {
                        return;
                    }

                    data["parameters"][input.parameter] = input.value();
                });
            }

            $.ajax({
                url: API_BASEURL + "printer/command",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            })
        };

        self.displayMode = function (customControl) {
            if (customControl.hasOwnProperty("children")) {
                if (customControl.name) {
                    return "customControls_containerTemplate_collapsable";
                } else {
                    return "customControls_containerTemplate_nameless";
                }
            } else {
                return "customControls_controlTemplate";
            }
        };

        self.rowCss = function (customControl) {
            var span = "span2";
            var offset = "";
            if (customControl.hasOwnProperty("width")) {
                span = "span" + customControl.width;
            }
            if (customControl.hasOwnProperty("offset")) {
                offset = "offset" + customControl.offset;
            }
            return span + " " + offset;
        };

        self.onStartup = function () {
            self.requestData();
        };

        self.updateRotatorWidth = function() {
            var webcamImage = $("#webcam_image");
            if (self.settings.webcam_rotate90()) {
                if (webcamImage.width() > 0) {
                    $("#webcam_rotator").css("height", webcamImage.width());
                } else {
                    webcamImage.off("load.rotator");
                    webcamImage.on("load.rotator", function() {
                        $("#webcam_rotator").css("height", webcamImage.width());
                        webcamImage.off("load.rotator");
                    });
                }
            } else {
                $("#webcam_rotator").css("height", "");
            }
        }

        self.onSettingsBeforeSave = self.updateRotatorWidth;

        self._disableWebcam = function() {
            // only disable webcam stream if tab is out of focus for more than 5s, otherwise we might cause
            // more load by the constant connection creation than by the actual webcam stream
            self.webcamDisableTimeout = setTimeout(function () {
                $("#webcam_image").attr("src", "");
            }, 5000);
        };

        self._enableWebcam = function() {
            if (self.tabTracking.selectedTab != "#control" || !self.tabTracking.browserTabVisible) {
                return;
            }

            if (self.webcamDisableTimeout != undefined) {
                clearTimeout(self.webcamDisableTimeout);
            }
            var webcamImage = $("#webcam_image");
            var currentSrc = webcamImage.attr("src");
            if (currentSrc === undefined || currentSrc.trim() == "") {
                var newSrc = CONFIG_WEBCAM_STREAM;
                if (CONFIG_WEBCAM_STREAM.lastIndexOf("?") > -1) {
                    newSrc += "&";
                } else {
                    newSrc += "?";
                }
                newSrc += new Date().getTime();

                self.updateRotatorWidth();
                webcamImage.attr("src", newSrc);
            }
        };

        self.onTabChange = function (current, previous) {
            if (current == "#control") {
                self._enableWebcam();
            } else if (previous == "#control") {
                self._disableWebcam();
            }
        };

        self.onBrowserTabVisibilityChange = function(status) {
            if (status) {
                self._enableWebcam();
            } else {
                self._disableWebcam();
            }
        };

        self.onAllBound = function (allViewModels) {
            var additionalControls = [];
            _.each(allViewModels, function (viewModel) {
                if (viewModel.hasOwnProperty("getAdditionalControls")) {
                    additionalControls = additionalControls.concat(viewModel.getAdditionalControls());
                }
            });
            if (additionalControls.length > 0) {
                self.additionalControls = additionalControls;
                self.rerenderControls();
            }
        };

        self.onFocus = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            self.keycontrolActive(true);
        };

        self.onMouseOver = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            $("#webcam_container").focus();
            self.keycontrolActive(true);
        };

        self.onMouseOut = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            $("#webcam_container").blur();
            self.keycontrolActive(false);
        };

        self.toggleKeycontrolHelp = function () {
            self.keycontrolHelpActive(!self.keycontrolHelpActive());
        };

        self.onKeyDown = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;

            var button = undefined;
            var visualizeClick = true;

            switch (event.which) {
                case 37: // left arrow key
                    // X-
                    button = $("#control-xdec");
                    break;
                case 38: // up arrow key
                    // Y+
                    button = $("#control-yinc");
                    break;
                case 39: // right arrow key
                    // X+
                    button = $("#control-xinc");
                    break;
                case 40: // down arrow key
                    // Y-
                    button = $("#control-ydec");
                    break;
                case 49: // number 1
                case 97: // numpad 1
                    // Distance 0.1
                    button = $("#control-distance01");
                    visualizeClick = false;
                    break;
                case 50: // number 2
                case 98: // numpad 2
                    // Distance 1
                    button = $("#control-distance1");
                    visualizeClick = false;
                    break;
                case 51: // number 3
                case 99: // numpad 3
                    // Distance 10
                    button = $("#control-distance10");
                    visualizeClick = false;
                    break;
                case 52: // number 4
                case 100: // numpad 4
                    // Distance 100
                    button = $("#control-distance100");
                    visualizeClick = false;
                    break;
                case 33: // page up key
                case 87: // w key
                    // z lift up
                    button = $("#control-zinc");
                    break;
                case 34: // page down key
                case 83: // s key
                    // z lift down
                    button = $("#control-zdec");
                    break;
                case 36: // home key
                    // xy home
                    button = $("#control-xyhome");
                    break;
                case 35: // end key
                    // z home
                    button = $("#control-zhome");
                    break;
                default:
                    event.preventDefault();
                    return false;
            }

            if (button === undefined) {
                return false;
            } else {
                event.preventDefault();
                if (visualizeClick) {
                    button.addClass("active");
                    setTimeout(function () {
                        button.removeClass("active");
                    }, 150);
                }
                button.click();
            }
        };

        self.stripDistanceDecimal = function(distance) {
            return distance.toString().replace(".", "");
        };

    }

    OCTOPRINT_VIEWMODELS.push([
        ControlViewModel,
        ["loginStateViewModel", "settingsViewModel", "tabTracking"],
        "#control"
    ]);
});

;

$(function() {
    function FirstRunViewModel() {
        var self = this;

        self.username = ko.observable(undefined);
        self.password = ko.observable(undefined);
        self.confirmedPassword = ko.observable(undefined);

        self.passwordMismatch = ko.pureComputed(function() {
            return self.password() != self.confirmedPassword();
        });

        self.validUsername = ko.pureComputed(function() {
            return self.username() && self.username().trim() != "";
        });

        self.validPassword = ko.pureComputed(function() {
            return self.password() && self.password().trim() != "";
        });

        self.validData = ko.pureComputed(function() {
            return !self.passwordMismatch() && self.validUsername() && self.validPassword();
        });

        self.keepAccessControl = function() {
            if (!self.validData()) return;

            var data = {
                "ac": true,
                "user": self.username(),
                "pass1": self.password(),
                "pass2": self.confirmedPassword()
            };
            self._sendData(data);
        };

        self.disableAccessControl = function() {
            $("#confirmation_dialog .confirmation_dialog_message").html(gettext("If you disable Access Control <strong>and</strong> your RaionPi installation is accessible from the internet, your printer <strong>will be accessible by everyone - that also includes the bad guys!</strong>"));
            $("#confirmation_dialog .confirmation_dialog_acknowledge").unbind("click");
            $("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {
                e.preventDefault();
                $("#confirmation_dialog").modal("hide");

                var data = {
                    "ac": false
                };
                self._sendData(data, function() {
                    // if the user indeed disables access control, we'll need to reload the page for this to take effect
                    showReloadOverlay();
                });
            });
            $("#confirmation_dialog").modal("show");
        };

        self._sendData = function(data, callback) {
            $.ajax({
                url: API_BASEURL + "setup",
                type: "POST",
                dataType: "json",
                data: data,
                success: function() {
                    self.closeDialog();
                    if (callback) callback();
                }
            });
        };

        self.showDialog = function() {
            $("#first_run_dialog").modal("show");
        };

        self.closeDialog = function() {
            $("#first_run_dialog").modal("hide");
        };

        self.onAllBound = function(allViewModels) {
            if (CONFIG_FIRST_RUN) {
                self.showDialog();
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        FirstRunViewModel,
        [],
        "#first_run_dialog"
    ]);
});

;

$(function() {
    function GcodeFilesViewModel(parameters) {
        var self = this;

        self.settingsViewModel = parameters[0];
        self.loginState = parameters[1];
        self.printerState = parameters[2];
        self.slicing = parameters[3];

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.isSdReady = ko.observable(undefined);

        self.searchQuery = ko.observable(undefined);
        self.searchQuery.subscribe(function() {
            self.performSearch();
        });

        self.freeSpace = ko.observable(undefined);
        self.totalSpace = ko.observable(undefined);
        self.freeSpaceString = ko.pureComputed(function() {
            if (!self.freeSpace())
                return "-";
            return formatSize(self.freeSpace());
        });
        self.totalSpaceString = ko.pureComputed(function() {
            if (!self.totalSpace())
                return "-";
            return formatSize(self.totalSpace());
        });

        self.diskusageWarning = ko.pureComputed(function() {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settingsViewModel.server_diskspace_warning();
        });
        self.diskusageCritical = ko.pureComputed(function() {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settingsViewModel.server_diskspace_critical();
        });
        self.diskusageString = ko.pureComputed(function() {
            if (self.diskusageCritical()) {
                return gettext("Your available free disk space is critically low.");
            } else if (self.diskusageWarning()) {
                return gettext("Your available free disk space is starting to run low.");
            } else {
                return gettext("Your current disk usage.");
            }
        });

        self.uploadButton = undefined;
        self.sdUploadButton = undefined;
        self.uploadProgressBar = undefined;
        self.localTarget = undefined;
        self.sdTarget = undefined;

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "gcodeFiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "upload": function(a, b) {
                    // sorts descending
                    if (b["date"] === undefined || a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function(a, b) {
                    // sorts descending
                    if (b["size"] === undefined || a["size"] > b["size"]) return -1;
                    if (a["size"] < b["size"]) return 1;
                    return 0;
                }
            },
            {
                "printed": function(file) {
                    return !(file["prints"] && file["prints"]["success"] && file["prints"]["success"] > 0);
                },
                "sd": function(file) {
                    return file["origin"] && file["origin"] == "sdcard";
                },
                "local": function(file) {
                    return !(file["origin"] && file["origin"] == "sdcard");
                },
                "machinecode": function(file) {
                    return file["type"] && file["type"] == "machinecode";
                },
                "model": function(file) {
                    return file["type"] && file["type"] == "model";
                }
            },
            "name",
            [],
            [["sd", "local"], ["machinecode", "model"]],
            0
        );

        self.isLoadActionPossible = ko.pureComputed(function() {
            return self.loginState.isUser() && !self.isPrinting() && !self.isPaused() && !self.isLoading();
        });

        self.isLoadAndPrintActionPossible = ko.pureComputed(function() {
            return self.loginState.isUser() && self.isOperational() && self.isLoadActionPossible();
        });

        self.printerState.filename.subscribe(function(newValue) {
            self.highlightFilename(newValue);
        });

        self.highlightFilename = function(filename) {
            if (filename == undefined) {
                self.listHelper.selectNone();
            } else {
                self.listHelper.selectItem(function(item) {
                    return item.name == filename;
                });
            }
        };

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
            self.isSdReady(data.flags.sdReady);
        };

        self._otherRequestInProgress = false;
        self.requestData = function(filenameToFocus, locationToFocus) {
            if (self._otherRequestInProgress) return;

            self._otherRequestInProgress = true;
            $.ajax({
                url: API_BASEURL + "files",
                method: "GET",
                dataType: "json",
                success: function(response) {
                    self.fromResponse(response, filenameToFocus, locationToFocus);
                    self._otherRequestInProgress = false;
                },
                error: function() {
                    self._otherRequestInProgress = false;
                }
            });
        };

        self.fromResponse = function(response, filenameToFocus, locationToFocus) {
            var files = response.files;
            _.each(files, function(element, index, list) {
                if (!element.hasOwnProperty("size")) element.size = undefined;
                if (!element.hasOwnProperty("date")) element.date = undefined;
            });
            self.listHelper.updateItems(files);

            if (filenameToFocus) {
                // got a file to scroll to
                if (locationToFocus === undefined) {
                    locationToFocus = "local";
                }
                var entryElement = self.getEntryElement({name: filenameToFocus, origin: locationToFocus});
                if (entryElement) {
                    var entryOffset = entryElement.offsetTop;
                    $(".gcode_files").slimScroll({ scrollTo: entryOffset + "px" });
                }
            }

            if (response.free != undefined) {
                self.freeSpace(response.free);
            }

            if (response.total != undefined) {
                self.totalSpace(response.total);
            }

            self.highlightFilename(self.printerState.filename());
        };

        self.loadFile = function(file, printAfterLoad) {
            if (!file || !file.refs || !file.refs.hasOwnProperty("resource")) return;

            $.ajax({
                url: file.refs.resource,
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({command: "select", print: printAfterLoad})
            });
        };

        self.removeFile = function(file) {
            if (!file || !file.refs || !file.refs.hasOwnProperty("resource")) return;

            $.ajax({
                url: file.refs.resource,
                type: "DELETE",
                success: function() {
                    self.requestData();
                }
            });
        };

        self.sliceFile = function(file) {
            if (!file) return;

            self.slicing.show(file.origin, file.name, true);
        };

        self.initSdCard = function() {
            self._sendSdCommand("init");
        };

        self.releaseSdCard = function() {
            self._sendSdCommand("release");
        };

        self.refreshSdFiles = function() {
            self._sendSdCommand("refresh");
        };

        self._sendSdCommand = function(command) {
            $.ajax({
                url: API_BASEURL + "printer/sd",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({command: command})
            });
        };

        self.downloadLink = function(data) {
            if (data["refs"] && data["refs"]["download"]) {
                return data["refs"]["download"];
            } else {
                return false;
            }
        };

        self.lastTimePrinted = function(data) {
            if (data["prints"] && data["prints"]["last"] && data["prints"]["last"]["date"]) {
                return data["prints"]["last"]["date"];
            } else {
                return "-";
            }
        };

        self.getSuccessClass = function(data) {
            if (!data["prints"] || !data["prints"]["last"]) {
                return "";
            }
            return data["prints"]["last"]["success"] ? "text-success" : "text-error";
        };

        self.templateFor = function(data) {
            return "files_template_" + data.type;
        };

        self.getEntryId = function(data) {
            return "gcode_file_" + md5(data["origin"] + ":" + data["name"]);
        };

        self.getEntryElement = function(data) {
            var entryId = self.getEntryId(data);
            var entryElements = $("#" + entryId);
            if (entryElements && entryElements[0]) {
                return entryElements[0];
            } else {
                return undefined;
            }
        };

        self.enableRemove = function(data) {
            return self.loginState.isUser() && !_.contains(self.printerState.busyFiles(), data.origin + ":" + data.name);
        };

        self.enableSelect = function(data, printAfterSelect) {
            var isLoadActionPossible = self.loginState.isUser() && self.isOperational() && !(self.isPrinting() || self.isPaused() || self.isLoading());
            return isLoadActionPossible && !self.listHelper.isSelected(data);
        };

        self.enableSlicing = function(data) {
            return self.loginState.isUser() && self.slicing.enableSlicingDialog();
        };

        self.enableAdditionalData = function(data) {
            return data["gcodeAnalysis"] || data["prints"] && data["prints"]["last"];
        };

        self.toggleAdditionalData = function(data) {
            var entryElement = self.getEntryElement(data);
            if (!entryElement) return;

            var additionalInfo = $(".additionalInfo", entryElement);
            additionalInfo.slideToggle("fast", function() {
                $(".toggleAdditionalData i", entryElement).toggleClass("icon-chevron-down icon-chevron-up");
            });
        };

        self.getAdditionalData = function(data) {
            var output = "";
            if (data["gcodeAnalysis"]) {
                if (data["gcodeAnalysis"]["filament"] && typeof(data["gcodeAnalysis"]["filament"]) == "object") {
                    var filament = data["gcodeAnalysis"]["filament"];
                    if (_.keys(filament).length == 1) {
                        output += gettext("Filament") + ": " + formatFilament(data["gcodeAnalysis"]["filament"]["tool" + 0]) + "<br>";
                    } else if (_.keys(filament).length > 1) {
                        for (var toolKey in filament) {
                            if (!_.startsWith(toolKey, "tool") || !filament[toolKey] || !filament[toolKey].hasOwnProperty("length") || filament[toolKey]["length"] <= 0) continue;

                            output += gettext("Filament") + " (" + gettext("Tool") + " " + toolKey.substr("tool".length) + "): " + formatFilament(filament[toolKey]) + "<br>";
                        }
                    }
                }
                output += gettext("Estimated Print Time") + ": " + formatDuration(data["gcodeAnalysis"]["estimatedPrintTime"]) + "<br>";
            }
            if (data["prints"] && data["prints"]["last"]) {
                output += gettext("Last Printed") + ": " + formatTimeAgo(data["prints"]["last"]["date"]) + "<br>";
                if (data["prints"]["last"]["lastPrintTime"]) {
                    output += gettext("Last Print Time") + ": " + formatDuration(data["prints"]["last"]["lastPrintTime"]);
                }
            }
            return output;
        };

        self.performSearch = function(e) {
            var query = self.searchQuery();
            if (query !== undefined && query.trim() != "") {
                query = query.toLocaleLowerCase();
                self.listHelper.changeSearchFunction(function(entry) {
                    return entry && entry["name"].toLocaleLowerCase().indexOf(query) > -1;
                });
            } else {
                self.listHelper.resetSearch();
            }

            return false;
        };

        self.onUserLoggedIn = function(user) {
            self.uploadButton.fileupload("enable");
        };

        self.onUserLoggedOut = function() {
            self.uploadButton.fileupload("disable");
        };

        self.onStartup = function() {
            $(".accordion-toggle[data-target='#files']").click(function() {
                var files = $("#files");
                if (files.hasClass("in")) {
                    files.removeClass("overflow_visible");
                } else {
                    setTimeout(function() {
                        files.addClass("overflow_visible");
                    }, 100);
                }
            });

            $(".gcode_files").slimScroll({
                height: "306px",
                size: "5px",
                distance: "0",
                railVisible: true,
                alwaysVisible: true,
                scrollBy: "102px"
            });

            //~~ Gcode upload

            self.uploadButton = $("#gcode_upload");
            self.sdUploadButton = $("#gcode_upload_sd");

            self.uploadProgress = $("#gcode_upload_progress");
            self.uploadProgressBar = $(".bar", self.uploadProgress);

            if (CONFIG_SD_SUPPORT) {
                self.localTarget = $("#drop_locally");
            } else {
                self.localTarget = $("#drop");
                self.listHelper.removeFilter('sd');
            }
            self.sdTarget = $("#drop_sd");

            self.loginState.isUser.subscribe(function(newValue) {
                self._enableLocalDropzone(newValue);
            });
            self._enableLocalDropzone(self.loginState.isUser());

            if (CONFIG_SD_SUPPORT) {
                self.printerState.isSdReady.subscribe(function(newValue) {
                    self._enableSdDropzone(newValue === true && self.loginState.isUser());
                });

                self.loginState.isUser.subscribe(function(newValue) {
                    self._enableSdDropzone(newValue === true && self.printerState.isSdReady());
                });

                self._enableSdDropzone(self.printerState.isSdReady() && self.loginState.isUser());
            }

            self.requestData();
        };

        self.onEventUpdatedFiles = function(payload) {
            if (payload.type == "gcode") {
                self.requestData();
            }
        };

        self.onEventSlicingDone = function(payload) {
            self.requestData();
        };

        self.onEventMetadataAnalysisFinished = function(payload) {
            self.requestData();
        };

        self.onEventMetadataStatisticsUpdated = function(payload) {
            self.requestData();
        };

        self.onEventTransferDone = function(payload) {
            self.requestData(payload.remote, "sdcard");
        };

        self.onServerConnect = function(payload) {
            self._enableDragNDrop(true);
            self.requestData();
        };

        self.onServerReconnect = function(payload) {
            self._enableDragNDrop(true);
            self.requestData();
        };

        self.onServerDisconnect = function(payload) {
            self._enableDragNDrop(false);
        };

        self._enableLocalDropzone = function(enable) {
            var options = {
                url: API_BASEURL + "files/local",
                dataType: "json",
                dropZone: enable ? self.localTarget : null,
                done: self._handleUploadDone,
                fail: self._handleUploadFail,
                progressall: self._handleUploadProgress
            };
            self.uploadButton.fileupload(options);
        };

        self._enableSdDropzone = function(enable) {
            var options = {
                url: API_BASEURL + "files/sdcard",
                dataType: "json",
                dropZone: enable ? self.sdTarget : null,
                done: self._handleUploadDone,
                fail: self._handleUploadFail,
                progressall: self._handleUploadProgress
            };
            self.sdUploadButton.fileupload(options);
        };

        self._enableDragNDrop = function(enable) {
            if (enable) {
                $(document).bind("dragover", self._handleDragNDrop);
                log.debug("Enabled drag-n-drop");
            } else {
                $(document).unbind("dragover", self._handleDragNDrop);
                log.debug("Disabled drag-n-drop");
            }
        };

        self._handleUploadDone = function(e, data) {
            var filename = undefined;
            var location = undefined;
            if (data.result.files.hasOwnProperty("sdcard")) {
                filename = data.result.files.sdcard.name;
                location = "sdcard";
            } else if (data.result.files.hasOwnProperty("local")) {
                filename = data.result.files.local.name;
                location = "local";
            }
            self.requestData(filename, location);

            if (_.endsWith(filename.toLowerCase(), ".stl")) {
                self.slicing.show(location, filename);
            }

            if (data.result.done) {
                self.uploadProgressBar
                    .css("width", "0%")
                    .text("");
                self.uploadProgress
                    .removeClass("progress-striped")
                    .removeClass("active");
            }
        };

        self._handleUploadFail = function(e, data) {
            var error = "<p>" + gettext("Could not upload the file. Make sure that it is a GCODE file and has the extension \".gcode\" or \".gco\" or that it is an STL file with the extension \".stl\".") + "</p>";
            error += pnotifyAdditionalInfo("<pre>" + data.jqXHR.responseText + "</pre>");
            new PNotify({
                title: "Upload failed",
                text: error,
                type: "error",
                hide: false
            });
            self.uploadProgressBar
                .css("width", "0%")
                .text("");
            self.uploadProgress
                .removeClass("progress-striped")
                .removeClass("active");
        };

        self._handleUploadProgress = function(e, data) {
            var progress = parseInt(data.loaded / data.total * 100, 10);

            self.uploadProgressBar
                .css("width", progress + "%")
                .text(gettext("Uploading ..."));

            if (progress >= 100) {
                self.uploadProgress
                    .addClass("progress-striped")
                    .addClass("active");
                self.uploadProgressBar
                    .text(gettext("Saving ..."));
            }
        };

        self._handleDragNDrop = function (e) {
            var dropOverlay = $("#drop_overlay");
            var dropZone = $("#drop");
            var dropZoneLocal = $("#drop_locally");
            var dropZoneSd = $("#drop_sd");
            var dropZoneBackground = $("#drop_background");
            var dropZoneLocalBackground = $("#drop_locally_background");
            var dropZoneSdBackground = $("#drop_sd_background");
            var timeout = window.dropZoneTimeout;

            if (!timeout) {
                dropOverlay.addClass('in');
            } else {
                clearTimeout(timeout);
            }

            var foundLocal = false;
            var foundSd = false;
            var found = false;
            var node = e.target;
            do {
                if (dropZoneLocal && node === dropZoneLocal[0]) {
                    foundLocal = true;
                    break;
                } else if (dropZoneSd && node === dropZoneSd[0]) {
                    foundSd = true;
                    break;
                } else if (dropZone && node === dropZone[0]) {
                    found = true;
                    break;
                }
                node = node.parentNode;
            } while (node != null);

            if (foundLocal) {
                dropZoneLocalBackground.addClass("hover");
                dropZoneSdBackground.removeClass("hover");
            } else if (foundSd && self.printerState.isSdReady()) {
                dropZoneSdBackground.addClass("hover");
                dropZoneLocalBackground.removeClass("hover");
            } else if (found) {
                dropZoneBackground.addClass("hover");
            } else {
                if (dropZoneLocalBackground) dropZoneLocalBackground.removeClass("hover");
                if (dropZoneSdBackground) dropZoneSdBackground.removeClass("hover");
                if (dropZoneBackground) dropZoneBackground.removeClass("hover");
            }

            window.dropZoneTimeout = setTimeout(function () {
                window.dropZoneTimeout = null;
                dropOverlay.removeClass("in");
                if (dropZoneLocal) dropZoneLocalBackground.removeClass("hover");
                if (dropZoneSd) dropZoneSdBackground.removeClass("hover");
                if (dropZone) dropZoneBackground.removeClass("hover");
            }, 100);
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        GcodeFilesViewModel,
        ["settingsViewModel", "loginStateViewModel", "printerStateViewModel", "slicingViewModel"],
        "#files_wrapper"
    ]);
});

;

$(function() {
    function LoginStateViewModel() {
        var self = this;

        self.loginUser = ko.observable("");
        self.loginPass = ko.observable("");
        self.loginRemember = ko.observable(false);

        self.loggedIn = ko.observable(false);
        self.username = ko.observable(undefined);
        self.isAdmin = ko.observable(false);
        self.isUser = ko.observable(false);

        self.allViewModels = undefined;

        self.currentUser = ko.observable(undefined);

        self.userMenuText = ko.pureComputed(function() {
            if (self.loggedIn()) {
                return self.username();
            } else {
                return gettext("Login");
            }
        });

        self.reloadUser = function() {
            if (self.currentUser() == undefined) {
                return;
            }

            $.ajax({
                url: API_BASEURL + "users/" + self.currentUser().name,
                type: "GET",
                success: self.fromResponse
            })
        };

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "login",
                type: "POST",
                data: {"passive": true},
                success: self.fromResponse
            })
        };

        self.fromResponse = function(response) {
            if (response && response.name) {
                self.loggedIn(true);
                self.username(response.name);
                self.isUser(response.user);
                self.isAdmin(response.admin);

                self.currentUser(response);

                _.each(self.allViewModels, function(viewModel) {
                    if (viewModel.hasOwnProperty("onUserLoggedIn")) {
                        viewModel.onUserLoggedIn(response);
                    }
                });
            } else {
                self.loggedIn(false);
                self.username(undefined);
                self.isUser(false);
                self.isAdmin(false);

                self.currentUser(undefined);

                _.each(self.allViewModels, function(viewModel) {
                    if (viewModel.hasOwnProperty("onUserLoggedOut")) {
                        viewModel.onUserLoggedOut();
                    }
                });
            }
        };

        self.login = function() {
            var username = self.loginUser();
            var password = self.loginPass();
            var remember = self.loginRemember();

            $.ajax({
                url: API_BASEURL + "login",
                type: "POST",
                data: {"user": username, "pass": password, "remember": remember},
                success: function(response) {
                    new PNotify({title: gettext("Login successful"), text: _.sprintf(gettext('You are now logged in as "%(username)s"'), {username: response.name}), type: "success"});
                    self.fromResponse(response);

                    self.loginUser("");
                    self.loginPass("");
                    self.loginRemember(false);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    new PNotify({title: gettext("Login failed"), text: gettext("User unknown or wrong password"), type: "error"});
                }
            })
        };

        self.logout = function() {
            $.ajax({
                url: API_BASEURL + "logout",
                type: "POST",
                success: function(response) {
                    new PNotify({title: gettext("Logout successful"), text: gettext("You are now logged out"), type: "success"});
                    self.fromResponse(response);
                },
                error: function(error) {
                    if (error && error.status === 401) {
                         self.fromResponse(false);
                    }
                }
            })
        };

        self.onLoginUserKeyup = function(data, event) {
            if (event.keyCode == 13) {
                $("#login_pass").focus();
            }
        };

        self.onLoginPassKeyup = function(data, event) {
            if (event.keyCode == 13) {
                self.login();
            }
        };

        self.onAllBound = function(allViewModels) {
            self.allViewModels = allViewModels;
        };

        self.onDataUpdaterReconnect = function() {
            self.requestData();
        };

        self.onStartupComplete = function() {
            self.requestData();
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        LoginStateViewModel,
        [],
        []
    ]);
});

;

$(function() {
    function NavigationViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.appearance = parameters[1];
        self.settings = parameters[2];
        self.usersettings = parameters[3];

        self.systemActions = self.settings.system_actions;

        self.appearanceClasses = ko.pureComputed(function() {
            var classes = self.appearance.color();
            if (self.appearance.colorTransparent()) {
                classes += " transparent";
            }
            return classes;
        });

        self.triggerAction = function(action) {
            var callback = function() {
                $.ajax({
                    url: API_BASEURL + "system",
                    type: "POST",
                    dataType: "json",
                    data: "action=" + action.action,
                    success: function() {
                        new PNotify({title: "Success", text: _.sprintf(gettext("The command \"%(command)s\" executed successfully"), {command: action.name}), type: "success"});
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        if (!action.hasOwnProperty("ignore") || !action.ignore) {
                            var error = "<p>" + _.sprintf(gettext("The command \"%(command)s\" could not be executed."), {command: action.name}) + "</p>";
                            error += pnotifyAdditionalInfo("<pre>" + jqXHR.responseText + "</pre>");
                            new PNotify({title: gettext("Error"), text: error, type: "error", hide: false});
                        }
                    }
                })
            };
            if (action.confirm) {
                showConfirmationDialog(action.confirm, function (e) {
                    callback();
                });
            } else {
                callback();
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        NavigationViewModel,
        ["loginStateViewModel", "appearanceViewModel", "settingsViewModel", "userSettingsViewModel"],
        "#navbar"
    ]);
});

;

$(function() {
    function PrinterStateViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        self.stateString = ko.observable(undefined);
        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.isSdReady = ko.observable(undefined);

        self.enablePrint = ko.pureComputed(function() {
            return self.isOperational() && self.isReady() && !self.isPrinting() && self.loginState.isUser() && self.filename() != undefined;
        });
        self.enablePause = ko.pureComputed(function() {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && self.loginState.isUser();
        });
        self.enableCancel = ko.pureComputed(function() {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && self.loginState.isUser();
        });

        self.filename = ko.observable(undefined);
        self.progress = ko.observable(undefined);
        self.filesize = ko.observable(undefined);
        self.filepos = ko.observable(undefined);
        self.printTime = ko.observable(undefined);
        self.printTimeLeft = ko.observable(undefined);
        self.sd = ko.observable(undefined);
        self.timelapse = ko.observable(undefined);

        self.busyFiles = ko.observableArray([]);

        self.filament = ko.observableArray([]);
        self.estimatedPrintTime = ko.observable(undefined);
        self.lastPrintTime = ko.observable(undefined);

        self.currentHeight = ko.observable(undefined);

        self.TITLE_PRINT_BUTTON_PAUSED = gettext("Restarts the print job from the beginning");
        self.TITLE_PRINT_BUTTON_UNPAUSED = gettext("Starts the print job");
        self.TITLE_PAUSE_BUTTON_PAUSED = gettext("Resumes the print job");
        self.TITLE_PAUSE_BUTTON_UNPAUSED = gettext("Pauses the print job");

        self.titlePrintButton = ko.observable(self.TITLE_PRINT_BUTTON_UNPAUSED);
        self.titlePauseButton = ko.observable(self.TITLE_PAUSE_BUTTON_UNPAUSED);

        self.estimatedPrintTimeString = ko.pureComputed(function() {
            if (self.lastPrintTime())
                return formatDuration(self.lastPrintTime());
            if (self.estimatedPrintTime())
                return formatDuration(self.estimatedPrintTime());
            return "-";
        });
        self.byteString = ko.pureComputed(function() {
            if (!self.filesize())
                return "-";
            var filepos = self.filepos() ? formatSize(self.filepos()) : "-";
            return filepos + " / " + formatSize(self.filesize());
        });
        self.heightString = ko.pureComputed(function() {
            if (!self.currentHeight())
                return "-";
            return _.sprintf("%.02fmm", self.currentHeight());
        });
        self.printTimeString = ko.pureComputed(function() {
            if (!self.printTime())
                return "-";
            return formatDuration(self.printTime());
        });
        self.printTimeLeftString = ko.pureComputed(function() {
            if (self.printTimeLeft() == undefined) {
                if (!self.printTime() || !(self.isPrinting() || self.isPaused())) {
                    return "-";
                } else {
                    return gettext("Calculating...");
                }
            } else {
                return formatFuzzyEstimation(self.printTimeLeft());
            }
        });
        self.progressString = ko.pureComputed(function() {
            if (!self.progress())
                return 0;
            return self.progress();
        });
        self.pauseString = ko.pureComputed(function() {
            if (self.isPaused())
                return gettext("Continue");
            else
                return gettext("Pause");
        });

        self.timelapseString = ko.pureComputed(function() {
            var timelapse = self.timelapse();

            if (!timelapse || !timelapse.hasOwnProperty("type"))
                return "-";

            var type = timelapse["type"];
            if (type == "zchange") {
                return gettext("On Z Change");
            } else if (type == "timed") {
                return gettext("Timed") + " (" + timelapse["options"]["interval"] + " " + gettext("sec") + ")";
            } else {
                return "-";
            }
        });

        self.fromCurrentData = function(data) {
            self._fromData(data);
        };

        self.fromHistoryData = function(data) {
            self._fromData(data);
        };

        self.fromTimelapseData = function(data) {
            self.timelapse(data);
        };

        self._fromData = function(data) {
            self._processStateData(data.state);
            self._processJobData(data.job);
            self._processProgressData(data.progress);
            self._processZData(data.currentZ);
            self._processBusyFiles(data.busyFiles);
        };

        self._processStateData = function(data) {
            var prevPaused = self.isPaused();

            self.stateString(gettext(data.text));
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isSdReady(data.flags.sdReady);

            if (self.isPaused() != prevPaused) {
                if (self.isPaused()) {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_PAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_PAUSED);
                } else {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_UNPAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_UNPAUSED);
                }
            }
        };

        self._processJobData = function(data) {
            if (data.file) {
                self.filename(data.file.name);
                self.filesize(data.file.size);
                self.sd(data.file.origin == "sdcard");
            } else {
                self.filename(undefined);
                self.filesize(undefined);
                self.sd(undefined);
            }

            self.estimatedPrintTime(data.estimatedPrintTime);
            self.lastPrintTime(data.lastPrintTime);

            var result = [];
            if (data.filament && typeof(data.filament) == "object" && _.keys(data.filament).length > 0) {
                for (var key in data.filament) {
                    if (!_.startsWith(key, "tool") || !data.filament[key] || !data.filament[key].hasOwnProperty("length") || data.filament[key].length <= 0) continue;

                    result.push({
                        name: ko.observable(gettext("Tool") + " " + key.substr("tool".length)),
                        data: ko.observable(data.filament[key])
                    });
                }
            }
            self.filament(result);
        };

        self._processProgressData = function(data) {
            if (data.completion) {
                self.progress(data.completion);
            } else {
                self.progress(undefined);
            }
            self.filepos(data.filepos);
            self.printTime(data.printTime);
            self.printTimeLeft(data.printTimeLeft);
        };

        self._processZData = function(data) {
            self.currentHeight(data);
        };

        self._processBusyFiles = function(data) {
            var busyFiles = [];
            _.each(data, function(entry) {
                if (entry.hasOwnProperty("name") && entry.hasOwnProperty("origin")) {
                    busyFiles.push(entry.origin + ":" + entry.name);
                }
            });
            self.busyFiles(busyFiles);
        };

        self.print = function() {
            var restartCommand = function() {
                self._jobCommand("restart");
            };

            if (self.isPaused()) {
                $("#confirmation_dialog .confirmation_dialog_message").text(gettext("This will restart the print job from the beginning."));
                $("#confirmation_dialog .confirmation_dialog_acknowledge").unbind("click");
                $("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog").modal("hide"); restartCommand(); });
                $("#confirmation_dialog").modal("show");
            } else {
                self._jobCommand("start");
            }

        };

        self.pause = function() {
            self._jobCommand("pause");
        };

        self.cancel = function() {
            self._jobCommand("cancel");
        };

        self._jobCommand = function(command, callback) {
            $.ajax({
                url: API_BASEURL + "job",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({command: command}),
                success: function(response) {
                    if (callback != undefined) {
                        callback();
                    }
                }
            });
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        PrinterStateViewModel,
        ["loginStateViewModel"],
        ["#state_wrapper", "#drop_overlay"]
    ]);
});

;

$(function() {
    function PrinterProfilesViewModel() {
        var self = this;

        self._cleanProfile = function() {
            return {
                id: "",
                name: "",
                model: "",
                color: "default",
                volume: {
                    formFactor: "rectangular",
                    width: 200,
                    depth: 200,
                    height: 200,
                    origin: "lowerleft"
                },
                heatedBed: true,
                axes: {
                    x: {speed: 6000, inverted: false},
                    y: {speed: 6000, inverted: false},
                    z: {speed: 200, inverted: false},
                    e: {speed: 300, inverted: false}
                },
                extruder: {
                    count: 1,
                    offsets: [
                        [0,0]
                    ],
                    nozzleDiameter: 0.4
                }
            }
        };

        self.requestInProgress = ko.observable(false);

        self.profiles = new ItemListHelper(
            "printerProfiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "name",
            [],
            [],
            10
        );
        self.defaultProfile = ko.observable();
        self.currentProfile = ko.observable();

        self.currentProfileData = ko.observable(ko.mapping.fromJS(self._cleanProfile()));

        self.editorNew = ko.observable(false);

        self.editorName = ko.observable();
        self.editorColor = ko.observable();
        self.editorIdentifier = ko.observable();
        self.editorIdentifierPlaceholder = ko.observable();
        self.editorModel = ko.observable();

        self.editorVolumeWidth = ko.observable();
        self.editorVolumeDepth = ko.observable();
        self.editorVolumeHeight = ko.observable();
        self.editorVolumeFormFactor = ko.observable();
        self.editorVolumeOrigin = ko.observable();

        self.editorVolumeFormFactor.subscribe(function(value) {
            if (value == "circular") {
                self.editorVolumeOrigin("center");
            }
        });

        self.editorHeatedBed = ko.observable();

        self.editorNozzleDiameter = ko.observable();
        self.editorExtruders = ko.observable();
        self.editorExtruderOffsets = ko.observableArray();

        self.editorAxisXSpeed = ko.observable();
        self.editorAxisYSpeed = ko.observable();
        self.editorAxisZSpeed = ko.observable();
        self.editorAxisESpeed = ko.observable();

        self.editorAxisXInverted = ko.observable(false);
        self.editorAxisYInverted = ko.observable(false);
        self.editorAxisZInverted = ko.observable(false);
        self.editorAxisEInverted = ko.observable(false);

        self.availableColors = ko.observable([
            {key: "default", name: gettext("default")},
            {key: "red", name: gettext("red")},
            {key: "orange", name: gettext("orange")},
            {key: "yellow", name: gettext("yellow")},
            {key: "green", name: gettext("green")},
            {key: "blue", name: gettext("blue")},
            {key: "black", name: gettext("black")}
        ]);

        self.availableOrigins = ko.pureComputed(function() {
            var formFactor = self.editorVolumeFormFactor();

            var possibleOrigins = {
                "lowerleft": gettext("Lower Left"),
                "center": gettext("Center")
            };

            var keys = [];
            if (formFactor == "rectangular") {
                keys = ["lowerleft", "center"];
            } else if (formFactor == "circular") {
                keys = ["center"];
            }

            var result = [];
            _.each(keys, function(key) {
               result.push({key: key, name: possibleOrigins[key]});
            });
            return result;
        });

        self.koEditorExtruderOffsets = ko.pureComputed(function() {
            var extruderOffsets = self.editorExtruderOffsets();
            var numExtruders = self.editorExtruders();
            if (!numExtruders) {
                numExtruders = 1;
            }

            if (numExtruders - 1 > extruderOffsets.length) {
                for (var i = extruderOffsets.length; i < numExtruders; i++) {
                    extruderOffsets[i] = {
                        idx: i + 1,
                        x: ko.observable(0),
                        y: ko.observable(0)
                    }
                }
                self.editorExtruderOffsets(extruderOffsets);
            }

            return extruderOffsets.slice(0, numExtruders - 1);
        });

        self.editorNameInvalid = ko.pureComputed(function() {
            return !self.editorName();
        });

        self.editorIdentifierInvalid = ko.pureComputed(function() {
            var identifier = self.editorIdentifier();
            var placeholder = self.editorIdentifierPlaceholder();
            var data = identifier;
            if (!identifier) {
                data = placeholder;
            }

            var validCharacters = (data && (data == self._sanitize(data)));

            var existingProfile = self.profiles.getItem(function(item) {return item.id == data});
            return !data || !validCharacters || (self.editorNew() && existingProfile != undefined);
        });

        self.editorIdentifierInvalidText = ko.pureComputed(function() {
            if (!self.editorIdentifierInvalid()) {
                return "";
            }

            if (!self.editorIdentifier() && !self.editorIdentifierPlaceholder()) {
                return gettext("Identifier must be set");
            } else if (self.editorIdentifier() != self._sanitize(self.editorIdentifier())) {
                return gettext("Invalid characters, only a-z, A-Z, 0-9, -, ., _, ( and ) are allowed")
            } else {
                return gettext("A profile with such an identifier already exists");
            }
        });

        self.enableEditorSubmitButton = ko.pureComputed(function() {
            return !self.editorNameInvalid() && !self.editorIdentifierInvalid() && !self.requestInProgress();
        });

        self.editorName.subscribe(function() {
            self.editorIdentifierPlaceholder(self._sanitize(self.editorName()).toLowerCase());
        });

        self.makeDefault = function(data) {
            var profile = {
                id: data.id,
                default: true
            };

            self.updateProfile(profile);
        };

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "printerprofiles",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            })
        };

        self.fromResponse = function(data) {
            var items = [];
            var defaultProfile = undefined;
            var currentProfile = undefined;
            var currentProfileData = undefined;
            _.each(data.profiles, function(entry) {
                if (entry.default) {
                    defaultProfile = entry.id;
                }
                if (entry.current) {
                    currentProfile = entry.id;
                    currentProfileData = ko.mapping.fromJS(entry, self.currentProfileData);
                }
                entry["isdefault"] = ko.observable(entry.default);
                entry["iscurrent"] = ko.observable(entry.current);
                items.push(entry);
            });
            self.profiles.updateItems(items);
            self.defaultProfile(defaultProfile);
            self.currentProfile(currentProfile);
            self.currentProfileData(currentProfileData);
        };

        self.addProfile = function(callback) {
            var profile = self._editorData();
            self.requestInProgress(true);
            $.ajax({
                url: API_BASEURL + "printerprofiles",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({profile: profile}),
                success: function() {
                    self.requestInProgress(false);
                    if (callback !== undefined) {
                        callback();
                    }
                    self.requestData();
                },
                error: function() {
                    self.requestInProgress(false);
                    var text = gettext("There was unexpected error while saving the printer profile, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                }
            });
        };

        self.removeProfile = function(data) {
            self.requestInProgress(true);
            $.ajax({
                url: data.resource,
                type: "DELETE",
                dataType: "json",
                success: function() {
                    self.requestInProgress(false);
                    self.requestData();
                },
                error: function() {
                    self.requestInProgress(false);
                    var text = gettext("There was unexpected error while removing the printer profile, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                }
            })
        };

        self.updateProfile = function(profile, callback) {
            if (profile == undefined) {
                profile = self._editorData();
            }

            self.requestInProgress(true);

            $.ajax({
                url: API_BASEURL + "printerprofiles/" + profile.id,
                type: "PATCH",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({profile: profile}),
                success: function() {
                    self.requestInProgress(false);
                    if (callback !== undefined) {
                        callback();
                    }
                    self.requestData();
                },
                error: function() {
                    self.requestInProgress(false);
                    var text = gettext("There was unexpected error while updating the printer profile, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                }
            });
        };

        self.showEditProfileDialog = function(data) {
            var add = false;
            if (data == undefined) {
                data = self._cleanProfile();
                add = true;
            }

            self.editorNew(add);

            self.editorIdentifier(data.id);
            self.editorName(data.name);
            self.editorColor(data.color);
            self.editorModel(data.model);

            self.editorVolumeWidth(data.volume.width);
            self.editorVolumeDepth(data.volume.depth);
            self.editorVolumeHeight(data.volume.height);
            self.editorVolumeFormFactor(data.volume.formFactor);
            self.editorVolumeOrigin(data.volume.origin);

            self.editorHeatedBed(data.heatedBed);

            self.editorNozzleDiameter(data.extruder.nozzleDiameter);
            self.editorExtruders(data.extruder.count);
            var offsets = [];
            if (data.extruder.count > 1) {
                _.each(_.slice(data.extruder.offsets, 1), function(offset, index) {
                    offsets.push({
                        idx: index + 1,
                        x: ko.observable(offset[0]),
                        y: ko.observable(offset[1])
                    });
                });
            }
            self.editorExtruderOffsets(offsets);

            self.editorAxisXSpeed(data.axes.x.speed);
            self.editorAxisXInverted(data.axes.x.inverted);
            self.editorAxisYSpeed(data.axes.y.speed);
            self.editorAxisYInverted(data.axes.y.inverted);
            self.editorAxisZSpeed(data.axes.z.speed);
            self.editorAxisZInverted(data.axes.z.inverted);
            self.editorAxisESpeed(data.axes.e.speed);
            self.editorAxisEInverted(data.axes.e.inverted);

            var editDialog = $("#settings_printerProfiles_editDialog");
            var confirmButton = $("button.btn-confirm", editDialog);
            var dialogTitle = $("h3.modal-title", editDialog);

            dialogTitle.text(add ? gettext("Add Printer Profile") : _.sprintf(gettext("Edit Printer Profile \"%(name)s\""), {name: data.name}));
            confirmButton.unbind("click");
            confirmButton.bind("click", function() {
                if (self.enableEditorSubmitButton()) {
                    self.confirmEditProfile(add);
                }
            });
            editDialog.modal("show");
        };

        self.confirmEditProfile = function(add) {
            var callback = function() {
                $("#settings_printerProfiles_editDialog").modal("hide");
            };

            if (add) {
                self.addProfile(callback);
            } else {
                self.updateProfile(undefined, callback);
            }
        };

        self._editorData = function() {
            var identifier = self.editorIdentifier();
            if (!identifier) {
                identifier = self.editorIdentifierPlaceholder();
            }

            var profile = {
                id: identifier,
                name: self.editorName(),
                color: self.editorColor(),
                model: self.editorModel(),
                volume: {
                    width: parseFloat(self.editorVolumeWidth()),
                    depth: parseFloat(self.editorVolumeDepth()),
                    height: parseFloat(self.editorVolumeHeight()),
                    formFactor: self.editorVolumeFormFactor(),
                    origin: self.editorVolumeOrigin()
                },
                heatedBed: self.editorHeatedBed(),
                extruder: {
                    count: parseInt(self.editorExtruders()),
                    offsets: [
                        [0.0, 0.0]
                    ],
                    nozzleDiameter: parseFloat(self.editorNozzleDiameter())
                },
                axes: {
                    x: {
                        speed: parseInt(self.editorAxisXSpeed()),
                        inverted: self.editorAxisXInverted()
                    },
                    y: {
                        speed: parseInt(self.editorAxisYSpeed()),
                        inverted: self.editorAxisYInverted()
                    },
                    z: {
                        speed: parseInt(self.editorAxisZSpeed()),
                        inverted: self.editorAxisZInverted()
                    },
                    e: {
                        speed: parseInt(self.editorAxisESpeed()),
                        inverted: self.editorAxisEInverted()
                    }
                }
            };

            if (self.editorExtruders() > 1) {
                for (var i = 0; i < self.editorExtruders() - 1; i++) {
                    var offset = [0.0, 0.0];
                    if (i < self.editorExtruderOffsets().length) {
                        try {
                            offset = [parseFloat(self.editorExtruderOffsets()[i]["x"]()), parseFloat(self.editorExtruderOffsets()[i]["y"]())];
                        } catch (exc) {
                            log.error("Invalid offset in profile", identifier, "for extruder", i+1, ":", self.editorExtruderOffsets()[i]["x"], ",", self.editorExtruderOffsets()[i]["y"]);
                        }
                    }
                    profile.extruder.offsets.push(offset);
                }
            }

            return profile;
        };

        self._sanitize = function(name) {
            return name.replace(/[^a-zA-Z0-9\-_\.\(\) ]/g, "").replace(/ /g, "_");
        };

        self.onSettingsShown = self.requestData;
        self.onStartup = self.requestData;
    }

    OCTOPRINT_VIEWMODELS.push([
        PrinterProfilesViewModel,
        [],
        []
    ]);
});

;

$(function() {
    function SettingsViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.users = parameters[1];
        self.printerProfiles = parameters[2];
        self.about = parameters[3];

        self.receiving = ko.observable(false);
        self.sending = ko.observable(false);
        self.exchanging = ko.pureComputed(function() {
            return self.receiving() || self.sending();
        });
        self.callbacks = [];

        self.api_enabled = ko.observable(undefined);
        self.api_key = ko.observable(undefined);
        self.api_allowCrossOrigin = ko.observable(undefined);

        self.appearance_name = ko.observable(undefined);
        self.appearance_color = ko.observable(undefined);
        self.appearance_colorTransparent = ko.observable();
        self.appearance_defaultLanguage = ko.observable();

        self.settingsDialog = undefined;
        self.translationManagerDialog = undefined;
        self.translationUploadElement = $("#settings_appearance_managelanguagesdialog_upload");
        self.translationUploadButton = $("#settings_appearance_managelanguagesdialog_upload_start");

        self.translationUploadFilename = ko.observable();
        self.invalidTranslationArchive = ko.pureComputed(function() {
            var name = self.translationUploadFilename();
            return name !== undefined && !(_.endsWith(name.toLocaleLowerCase(), ".zip") || _.endsWith(name.toLocaleLowerCase(), ".tar.gz") || _.endsWith(name.toLocaleLowerCase(), ".tgz") || _.endsWith(name.toLocaleLowerCase(), ".tar"));
        });
        self.enableTranslationUpload = ko.pureComputed(function() {
            var name = self.translationUploadFilename();
            return name !== undefined && name.trim() != "" && !self.invalidTranslationArchive();
        });

        self.translations = new ItemListHelper(
            "settings.translations",
            {
                "locale": function (a, b) {
                    // sorts ascending
                    if (a["locale"].toLocaleLowerCase() < b["locale"].toLocaleLowerCase()) return -1;
                    if (a["locale"].toLocaleLowerCase() > b["locale"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
            },
            "locale",
            [],
            [],
            0
        );

        self.appearance_available_colors = ko.observable([
            {key: "default", name: gettext("default")},
            {key: "red", name: gettext("red")},
            {key: "orange", name: gettext("orange")},
            {key: "yellow", name: gettext("yellow")},
            {key: "green", name: gettext("green")},
            {key: "blue", name: gettext("blue")},
            {key: "violet", name: gettext("violet")},
            {key: "black", name: gettext("black")},
            {key: "white", name: gettext("white")},
        ]);

        self.appearance_colorName = function(color) {
            switch (color) {
                case "red":
                    return gettext("red");
                case "orange":
                    return gettext("orange");
                case "yellow":
                    return gettext("yellow");
                case "green":
                    return gettext("green");
                case "blue":
                    return gettext("blue");
                case "violet":
                    return gettext("violet");
                case "black":
                    return gettext("black");
                case "white":
                    return gettext("white");
                case "default":
                    return gettext("default");
                default:
                    return color;
            }
        };

        var auto_locale = {language: "_default", display: gettext("Autodetect from browser"), english: undefined};
        self.locales = ko.observableArray([auto_locale].concat(_.sortBy(_.values(AVAILABLE_LOCALES), function(n) {
            return n.display;
        })));
        self.locale_languages = _.keys(AVAILABLE_LOCALES);

        self.printer_defaultExtrusionLength = ko.observable(undefined);

        self.webcam_streamUrl = ko.observable(undefined);
        self.webcam_snapshotUrl = ko.observable(undefined);
        self.webcam_ffmpegPath = ko.observable(undefined);
        self.webcam_bitrate = ko.observable(undefined);
        self.webcam_ffmpegThreads = ko.observable(undefined);
        self.webcam_watermark = ko.observable(undefined);
        self.webcam_flipH = ko.observable(undefined);
        self.webcam_flipV = ko.observable(undefined);
        self.webcam_rotate90 = ko.observable(undefined);

        self.feature_gcodeViewer = ko.observable(undefined);
        self.feature_temperatureGraph = ko.observable(undefined);
        self.feature_waitForStart = ko.observable(undefined);
        self.feature_alwaysSendChecksum = ko.observable(undefined);
        self.feature_sdSupport = ko.observable(undefined);
        self.feature_sdAlwaysAvailable = ko.observable(undefined);
        self.feature_swallowOkAfterResend = ko.observable(undefined);
        self.feature_repetierTargetTemp = ko.observable(undefined);
        self.feature_disableExternalHeatupDetection = ko.observable(undefined);
        self.feature_keyboardControl = ko.observable(undefined);
        self.feature_pollWatched = ko.observable(undefined);
        self.feature_ignoreIdenticalResends = ko.observable(undefined);

        self.serial_port = ko.observable();
        self.serial_baudrate = ko.observable();
        self.serial_portOptions = ko.observableArray([]);
        self.serial_baudrateOptions = ko.observableArray([]);
        self.serial_autoconnect = ko.observable(undefined);
        self.serial_timeoutConnection = ko.observable(undefined);
        self.serial_timeoutDetection = ko.observable(undefined);
        self.serial_timeoutCommunication = ko.observable(undefined);
        self.serial_timeoutTemperature = ko.observable(undefined);
        self.serial_timeoutSdStatus = ko.observable(undefined);
        self.serial_log = ko.observable(undefined);
        self.serial_additionalPorts = ko.observable(undefined);
        self.serial_longRunningCommands = ko.observable(undefined);
        self.serial_checksumRequiringCommands = ko.observable(undefined);
        self.serial_helloCommand = ko.observable(undefined);
        self.serial_ignoreErrorsFromFirmware = ko.observable(undefined);
        self.serial_disconnectOnErrors = ko.observable(undefined);
        self.serial_triggerOkForM29 = ko.observable(undefined);
        self.serial_supportResendsWithoutOk = ko.observable(undefined);

        self.folder_uploads = ko.observable(undefined);
        self.folder_timelapse = ko.observable(undefined);
        self.folder_timelapseTmp = ko.observable(undefined);
        self.folder_logs = ko.observable(undefined);
        self.folder_watched = ko.observable(undefined);

        self.scripts_gcode_beforePrintStarted = ko.observable(undefined);
        self.scripts_gcode_afterPrintDone = ko.observable(undefined);
        self.scripts_gcode_afterPrintCancelled = ko.observable(undefined);
        self.scripts_gcode_afterPrintPaused = ko.observable(undefined);
        self.scripts_gcode_beforePrintResumed = ko.observable(undefined);
        self.scripts_gcode_afterPrinterConnected = ko.observable(undefined);

        self.temperature_profiles = ko.observableArray(undefined);
        self.temperature_cutoff = ko.observable(undefined);

        self.system_actions = ko.observableArray([]);

        self.terminalFilters = ko.observableArray([]);

        self.server_commands_systemShutdownCommand = ko.observable(undefined);
        self.server_commands_systemRestartCommand = ko.observable(undefined);
        self.server_commands_serverRestartCommand = ko.observable(undefined);

        self.server_diskspace_warning = ko.observable();
        self.server_diskspace_critical = ko.observable();
        self.server_diskspace_warning_str = sizeObservable(self.server_diskspace_warning);
        self.server_diskspace_critical_str = sizeObservable(self.server_diskspace_critical);

        self.settings = undefined;

        self.addTemperatureProfile = function() {
            self.temperature_profiles.push({name: "New", extruder:0, bed:0});
        };

        self.removeTemperatureProfile = function(profile) {
            self.temperature_profiles.remove(profile);
        };

        self.addTerminalFilter = function() {
            self.terminalFilters.push({name: "New", regex: "(Send: M105)|(Recv: ok T:)"})
        };

        self.removeTerminalFilter = function(filter) {
            self.terminalFilters.remove(filter);
        };

        self.onSettingsShown = function() {
          self.requestData();
        };

        self.onStartup = function() {
            self.settingsDialog = $('#settings_dialog');
            self.translationManagerDialog = $('#settings_appearance_managelanguagesdialog');
            self.translationUploadElement = $("#settings_appearance_managelanguagesdialog_upload");
            self.translationUploadButton = $("#settings_appearance_managelanguagesdialog_upload_start");

            self.translationUploadElement.fileupload({
                dataType: "json",
                maxNumberOfFiles: 1,
                autoUpload: false,
                add: function(e, data) {
                    if (data.files.length == 0) {
                        return false;
                    }

                    self.translationUploadFilename(data.files[0].name);

                    self.translationUploadButton.unbind("click");
                    self.translationUploadButton.bind("click", function() {
                        data.submit();
                        return false;
                    });
                },
                done: function(e, data) {
                    self.translationUploadButton.unbind("click");
                    self.translationUploadFilename(undefined);
                    self.fromTranslationResponse(data.result);
                },
                fail: function(e, data) {
                    self.translationUploadButton.unbind("click");
                    self.translationUploadFilename(undefined);
                }
            });
        };

        self.onAllBound = function(allViewModels) {
            self.settingsDialog.on('show', function(event) {
                if (event.target.id == "settings_dialog") {
                    self.requestTranslationData();
                    _.each(allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("onSettingsShown")) {
                            viewModel.onSettingsShown();
                        }
                    });
                }
            });
            self.settingsDialog.on('hidden', function(event) {
                if (event.target.id == "settings_dialog") {
                    _.each(allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("onSettingsHidden")) {
                            viewModel.onSettingsHidden();
                        }
                    });
                }
            });
            self.settingsDialog.on('beforeSave', function () {
                _.each(allViewModels, function (viewModel) {
                    if (viewModel.hasOwnProperty("onSettingsBeforeSave")) {
                        viewModel.onSettingsBeforeSave();
                    }
                });
            });

            // reset scroll position on tab change
            $('ul.nav-list a[data-toggle="tab"]', self.settingsDialog).on("show", function() {
                self._resetScrollPosition();
            });
        };

        self.show = function(tab) {
            // select first or specified tab
            self.selectTab(tab);

            // reset scroll position
            self._resetScrollPosition();

            // show settings, ensure centered position
            self.settingsDialog.modal({
                minHeight: function() { return Math.max($.fn.modal.defaults.maxHeight() - 80, 250); }
            }).css({
                width: 'auto',
                'margin-left': function() { return -($(this).width() /2); }
            });

            return false;
        };

        self.hide = function() {
            self.settingsDialog.modal("hide");
        };

        self.showTranslationManager = function() {
            self.translationManagerDialog.modal();
            return false;
        };

        self.requestData = function(callback) {
            if (self.receiving()) {
                if (callback) {
                    self.callbacks.push(callback);
                }
                return;
            }

            self.receiving(true);
            $.ajax({
                url: API_BASEURL + "settings",
                type: "GET",
                dataType: "json",
                success: function(response) {
                    if (callback) {
                        self.callbacks.push(callback);
                    }

                    try {
                        self.fromResponse(response);

                        var cb;
                        while (self.callbacks.length) {
                            cb = self.callbacks.shift();
                            try {
                                cb();
                            } catch(exc) {
                                log.error("Error calling settings callback", cb, ":", (exc.stack || exc));
                            }
                        }
                    } finally {
                        self.receiving(false);
                        self.callbacks = [];
                    }
                },
                error: function(xhr) {
                    self.receiving(false);
                }
            });
        };

        self.requestTranslationData = function(callback) {
            $.ajax({
                url: API_BASEURL + "languages",
                type: "GET",
                dataType: "json",
                success: function(response) {
                    self.fromTranslationResponse(response);
                    if (callback) callback();
                }
            })
        };

        self.fromTranslationResponse = function(response) {
            var translationsByLocale = {};
            _.each(response.language_packs, function(item, key) {
                _.each(item.languages, function(pack) {
                    var locale = pack.locale;
                    if (!_.has(translationsByLocale, locale)) {
                        translationsByLocale[locale] = {
                            locale: locale,
                            display: pack.locale_display,
                            english: pack.locale_english,
                            packs: []
                        };
                    }

                    translationsByLocale[locale]["packs"].push({
                        identifier: key,
                        display: item.display,
                        pack: pack
                    });
                });
            });

            var translations = [];
            _.each(translationsByLocale, function(item) {
                item["packs"].sort(function(a, b) {
                    if (a.identifier == "_core") return -1;
                    if (b.identifier == "_core") return 1;

                    if (a.display < b.display) return -1;
                    if (a.display > b.display) return 1;
                    return 0;
                });
                translations.push(item);
            });

            self.translations.updateItems(translations);
        };

        self.languagePackDisplay = function(item) {
            return item.display + ((item.english != undefined) ? ' (' + item.english + ')' : '');
        };

        self.languagePacksAvailable = ko.pureComputed(function() {
            return self.translations.allSize() > 0;
        });

        self.deleteLanguagePack = function(locale, pack) {
            $.ajax({
                url: API_BASEURL + "languages/" + locale + "/" + pack,
                type: "DELETE",
                dataType: "json",
                success: function(response) {
                    self.fromTranslationResponse(response);
                }
            })
        };

        self.fromResponse = function(response) {
            if (self.settings === undefined) {
                self.settings = ko.mapping.fromJS(response);
            } else {
                ko.mapping.fromJS(response, self.settings);
            }

            self.api_enabled(response.api.enabled);
            self.api_key(response.api.key);
            self.api_allowCrossOrigin(response.api.allowCrossOrigin);

            self.appearance_name(response.appearance.name);
            self.appearance_color(response.appearance.color);
            self.appearance_colorTransparent(response.appearance.colorTransparent);
            self.appearance_defaultLanguage("_default");
            if (_.includes(self.locale_languages, response.appearance.defaultLanguage)) {
                self.appearance_defaultLanguage(response.appearance.defaultLanguage);
            }

            self.printer_defaultExtrusionLength(response.printer.defaultExtrusionLength);

            self.webcam_streamUrl(response.webcam.streamUrl);
            self.webcam_snapshotUrl(response.webcam.snapshotUrl);
            self.webcam_ffmpegPath(response.webcam.ffmpegPath);
            self.webcam_bitrate(response.webcam.bitrate);
            self.webcam_ffmpegThreads(response.webcam.ffmpegThreads);
            self.webcam_watermark(response.webcam.watermark);
            self.webcam_flipH(response.webcam.flipH);
            self.webcam_flipV(response.webcam.flipV);
            self.webcam_rotate90(response.webcam.rotate90);

            self.feature_gcodeViewer(response.feature.gcodeViewer);
            self.feature_temperatureGraph(response.feature.temperatureGraph);
            self.feature_waitForStart(response.feature.waitForStart);
            self.feature_alwaysSendChecksum(response.feature.alwaysSendChecksum);
            self.feature_sdSupport(response.feature.sdSupport);
            self.feature_sdAlwaysAvailable(response.feature.sdAlwaysAvailable);
            self.feature_swallowOkAfterResend(response.feature.swallowOkAfterResend);
            self.feature_repetierTargetTemp(response.feature.repetierTargetTemp);
            self.feature_disableExternalHeatupDetection(!response.feature.externalHeatupDetection);
            self.feature_keyboardControl(response.feature.keyboardControl);
            self.feature_pollWatched(response.feature.pollWatched);

            self.serial_port(response.serial.port);
            self.serial_baudrate(response.serial.baudrate);
            self.serial_portOptions(response.serial.portOptions);
            self.serial_baudrateOptions(response.serial.baudrateOptions);
            self.serial_autoconnect(response.serial.autoconnect);
            self.serial_timeoutConnection(response.serial.timeoutConnection);
            self.serial_timeoutDetection(response.serial.timeoutDetection);
            self.serial_timeoutCommunication(response.serial.timeoutCommunication);
            self.serial_timeoutTemperature(response.serial.timeoutTemperature);
            self.serial_timeoutSdStatus(response.serial.timeoutSdStatus);
            self.serial_log(response.serial.log);
            self.serial_additionalPorts(response.serial.additionalPorts.join("\n"));
            self.serial_longRunningCommands(response.serial.longRunningCommands.join(", "));
            self.serial_checksumRequiringCommands(response.serial.checksumRequiringCommands.join(", "));
            self.serial_helloCommand(response.serial.helloCommand);
            self.serial_ignoreErrorsFromFirmware(response.serial.ignoreErrorsFromFirmware);
            self.serial_disconnectOnErrors(response.serial.disconnectOnErrors);
            self.serial_triggerOkForM29(response.serial.triggerOkForM29);
            self.serial_supportResendsWithoutOk(response.serial.supportResendsWithoutOk);

            self.folder_uploads(response.folder.uploads);
            self.folder_timelapse(response.folder.timelapse);
            self.folder_timelapseTmp(response.folder.timelapseTmp);
            self.folder_logs(response.folder.logs);
            self.folder_watched(response.folder.watched);

            self.temperature_profiles(response.temperature.profiles);

            self.scripts_gcode_beforePrintStarted(response.scripts.gcode.beforePrintStarted);
            self.scripts_gcode_afterPrintDone(response.scripts.gcode.afterPrintDone);
            self.scripts_gcode_afterPrintCancelled(response.scripts.gcode.afterPrintCancelled);
            self.scripts_gcode_afterPrintPaused(response.scripts.gcode.afterPrintPaused);
            self.scripts_gcode_beforePrintResumed(response.scripts.gcode.beforePrintResumed);
            self.scripts_gcode_afterPrinterConnected(response.scripts.gcode.afterPrinterConnected);

            self.temperature_profiles(response.temperature.profiles);
            self.temperature_cutoff(response.temperature.cutoff);

            self.system_actions(response.system.actions);

            self.terminalFilters(response.terminalFilters);

            self.server_commands_systemShutdownCommand(response.server.commands.systemShutdownCommand);
            self.server_commands_systemRestartCommand(response.server.commands.systemRestartCommand);
            self.server_commands_serverRestartCommand(response.server.commands.serverRestartCommand);
        };

        self.saveData = function (data, successCallback) {
            self.settingsDialog.trigger("beforeSave");

            if (data == undefined) {
                // we only set sending to true when we didn't include data
                self.sending(true);
                data = ko.mapping.toJS(self.settings);

                data = _.extend(data, {
                    "api" : {
                        "enabled": self.api_enabled(),
                        "key": self.api_key(),
                        "allowCrossOrigin": self.api_allowCrossOrigin()
                    },
                    "appearance" : {
                        "name": self.appearance_name(),
                        "color": self.appearance_color(),
                        "colorTransparent": self.appearance_colorTransparent(),
                        "defaultLanguage": self.appearance_defaultLanguage()
                    },
                    "printer": {
                        "defaultExtrusionLength": self.printer_defaultExtrusionLength()
                    },
                    "webcam": {
                        "streamUrl": self.webcam_streamUrl(),
                        "snapshotUrl": self.webcam_snapshotUrl(),
                        "ffmpegPath": self.webcam_ffmpegPath(),
                        "bitrate": self.webcam_bitrate(),
                        "ffmpegThreads": self.webcam_ffmpegThreads(),
                        "watermark": self.webcam_watermark(),
                        "flipH": self.webcam_flipH(),
                        "flipV": self.webcam_flipV(),
                        "rotate90": self.webcam_rotate90()
                    },
                    "feature": {
                        "gcodeViewer": self.feature_gcodeViewer(),
                        "temperatureGraph": self.feature_temperatureGraph(),
                        "waitForStart": self.feature_waitForStart(),
                        "alwaysSendChecksum": self.feature_alwaysSendChecksum(),
                        "sdSupport": self.feature_sdSupport(),
                        "sdAlwaysAvailable": self.feature_sdAlwaysAvailable(),
                        "swallowOkAfterResend": self.feature_swallowOkAfterResend(),
                        "repetierTargetTemp": self.feature_repetierTargetTemp(),
                        "externalHeatupDetection": !self.feature_disableExternalHeatupDetection(),
                        "keyboardControl": self.feature_keyboardControl(),
                        "pollWatched": self.feature_pollWatched()
                    },
                    "serial": {
                        "port": self.serial_port(),
                        "baudrate": self.serial_baudrate(),
                        "autoconnect": self.serial_autoconnect(),
                        "timeoutConnection": self.serial_timeoutConnection(),
                        "timeoutDetection": self.serial_timeoutDetection(),
                        "timeoutCommunication": self.serial_timeoutCommunication(),
                        "timeoutTemperature": self.serial_timeoutTemperature(),
                        "timeoutSdStatus": self.serial_timeoutSdStatus(),
                        "log": self.serial_log(),
                        "additionalPorts": commentableLinesToArray(self.serial_additionalPorts()),
                        "longRunningCommands": splitTextToArray(self.serial_longRunningCommands(), ",", true),
                        "checksumRequiringCommands": splitTextToArray(self.serial_checksumRequiringCommands(), ",", true),
                        "helloCommand": self.serial_helloCommand(),
                        "ignoreErrorsFromFirmware": self.serial_ignoreErrorsFromFirmware(),
                        "disconnectOnErrors": self.serial_disconnectOnErrors(),
                        "triggerOkForM29": self.serial_triggerOkForM29(),
                        "supportResendsWithoutOk": self.serial_supportResendsWithoutOk()
                    },
                    "folder": {
                        "uploads": self.folder_uploads(),
                        "timelapse": self.folder_timelapse(),
                        "timelapseTmp": self.folder_timelapseTmp(),
                        "logs": self.folder_logs(),
                        "watched": self.folder_watched()
                    },
                    "temperature": {
                        "profiles": self.temperature_profiles(),
                        "cutoff": self.temperature_cutoff()
                    },
                    "system": {
                        "actions": self.system_actions()
                    },
                    "terminalFilters": self.terminalFilters(),
                    "scripts": {
                        "gcode": {
                            "beforePrintStarted": self.scripts_gcode_beforePrintStarted(),
                            "afterPrintDone": self.scripts_gcode_afterPrintDone(),
                            "afterPrintCancelled": self.scripts_gcode_afterPrintCancelled(),
                            "afterPrintPaused": self.scripts_gcode_afterPrintPaused(),
                            "beforePrintResumed": self.scripts_gcode_beforePrintResumed(),
                            "afterPrinterConnected": self.scripts_gcode_afterPrinterConnected()
                        }
                    },
                    "server": {
                        "commands": {
                            "systemShutdownCommand": self.server_commands_systemShutdownCommand(),
                            "systemRestartCommand": self.server_commands_systemRestartCommand(),
                            "serverRestartCommand": self.server_commands_serverRestartCommand()
                        }
                    }
                });
            }

            $.ajax({
                url: API_BASEURL + "settings",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data),
                success: function(response) {
                    self.receiving(true);
                    self.sending(false);
                    try {
                        self.fromResponse(response);
                        if (successCallback) successCallback(response);
                    } finally {
                        self.receiving(false);
                    }
                },
                error: function(xhr) {
                    self.sending(false);
                }
            });
        };

        self.onEventSettingsUpdated = function() {
            self.requestData();
        };

        self._resetScrollPosition = function() {
            $('.scrollable', self.settingsDialog).scrollTop(0);
        };

        self.selectTab = function(tab) {
            if (tab != undefined) {
                if (!_.startsWith(tab, "#")) {
                    tab = "#" + tab;
                }
                $('ul.nav-list a[href="' + tab + '"]', self.settingsDialog).tab("show");
            } else {
                $('ul.nav-list a:first', self.settingsDialog).tab("show");
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        SettingsViewModel,
        ["loginStateViewModel", "usersViewModel", "printerProfilesViewModel", "aboutViewModel"],
        ["#settings_dialog", "#navbar_settings"]
    ]);
});

;

$(function() {
    function SlicingViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.printerProfiles = parameters[1];

        self.target = undefined;
        self.file = undefined;
        self.data = undefined;

        self.defaultSlicer = undefined;
        self.defaultProfile = undefined;

        self.gcodeFilename = ko.observable();

        self.title = ko.observable();
        self.slicer = ko.observable();
        self.slicers = ko.observableArray();
        self.profile = ko.observable();
        self.profiles = ko.observableArray();
        self.printerProfile = ko.observable();

        self.configured_slicers = ko.pureComputed(function() {
            return _.filter(self.slicers(), function(slicer) {
                return slicer.configured;
            });
        });

        self.afterSlicingOptions = [
            {"value": "none", "text": gettext("Do nothing")},
            {"value": "select", "text": gettext("Select for printing")},
            {"value": "print", "text": gettext("Start printing")}
        ];
        self.afterSlicing = ko.observable("none");

        self.show = function(target, file, force) {
            if (!self.enableSlicingDialog() && !force) {
                return;
            }

            self.requestData();
            self.target = target;
            self.file = file;
            self.title(_.sprintf(gettext("Slicing %(filename)s"), {filename: self.file}));
            self.gcodeFilename(self.file.substr(0, self.file.lastIndexOf(".")));
            self.printerProfile(self.printerProfiles.currentProfile());
            self.afterSlicing("none");
            $("#slicing_configuration_dialog").modal("show");
        };

        self.slicer.subscribe(function(newValue) {
            self.profilesForSlicer(newValue);
        });

        self.enableSlicingDialog = ko.pureComputed(function() {
            return self.configured_slicers().length > 0;
        });

        self.enableSliceButton = ko.pureComputed(function() {
            return self.gcodeFilename() != undefined
                && self.gcodeFilename().trim() != ""
                && self.slicer() != undefined
                && self.profile() != undefined;
        });

        self.requestData = function(callback) {
            $.ajax({
                url: API_BASEURL + "slicing",
                type: "GET",
                dataType: "json",
                success: function(data) {
                    self.fromResponse(data);
                    if (callback !== undefined) {
                        callback();
                    }
                }
            });
        };

        self.fromResponse = function(data) {
            self.data = data;

            var selectedSlicer = undefined;
            self.slicers.removeAll();
            _.each(_.values(data), function(slicer) {
                var name = slicer.displayName;
                if (name == undefined) {
                    name = slicer.key;
                }

                if (slicer.default && slicer.configured) {
                    selectedSlicer = slicer.key;
                }

                self.slicers.push({
                    key: slicer.key,
                    name: name,
                    configured: slicer.configured
                });
            });

            if (selectedSlicer != undefined) {
                self.slicer(selectedSlicer);
            }

            self.defaultSlicer = selectedSlicer;
        };

        self.profilesForSlicer = function(key) {
            if (key == undefined) {
                key = self.slicer();
            }
            if (key == undefined || !self.data.hasOwnProperty(key)) {
                return;
            }
            var slicer = self.data[key];

            var selectedProfile = undefined;
            self.profiles.removeAll();
            _.each(_.values(slicer.profiles), function(profile) {
                var name = profile.displayName;
                if (name == undefined) {
                    name = profile.key;
                }

                if (profile.default) {
                    selectedProfile = profile.key;
                }

                self.profiles.push({
                    key: profile.key,
                    name: name
                })
            });

            if (selectedProfile != undefined) {
                self.profile(selectedProfile);
            }

            self.defaultProfile = selectedProfile;
        };

        self.slice = function() {
            var gcodeFilename = self._sanitize(self.gcodeFilename());
            if (!_.endsWith(gcodeFilename.toLowerCase(), ".gco")
                && !_.endsWith(gcodeFilename.toLowerCase(), ".gcode")
                && !_.endsWith(gcodeFilename.toLowerCase(), ".g")) {
                gcodeFilename = gcodeFilename + ".gco";
            }

            var data = {
                command: "slice",
                slicer: self.slicer(),
                profile: self.profile(),
                printerProfile: self.printerProfile(),
                gcode: gcodeFilename
            };

            if (self.afterSlicing() == "print") {
                data["print"] = true;
            } else if (self.afterSlicing() == "select") {
                data["select"] = true;
            }

            $.ajax({
                url: API_BASEURL + "files/" + self.target + "/" + self.file,
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });

            $("#slicing_configuration_dialog").modal("hide");

            self.gcodeFilename(undefined);
            self.slicer(self.defaultSlicer);
            self.profile(self.defaultProfile);
        };

        self._sanitize = function(name) {
            return name.replace(/[^a-zA-Z0-9\-_\.\(\) ]/g, "").replace(/ /g, "_");
        };

        self.onStartup = function() {
            self.requestData();
        };

        self.onEventSettingsUpdated = function(payload) {
            self.requestData();
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        SlicingViewModel,
        ["loginStateViewModel", "printerProfilesViewModel"],
        "#slicing_configuration_dialog"
    ]);
});

;

$(function() {
    function TemperatureViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];

        self._createToolEntry = function() {
            return {
                name: ko.observable(),
                key: ko.observable(),
                actual: ko.observable(0),
                target: ko.observable(0),
                offset: ko.observable(0),
                newTarget: ko.observable(),
                newOffset: ko.observable()
            }
        };

        self.tools = ko.observableArray([]);
        self.hasBed = ko.observable(true);
        self.bedTemp = self._createToolEntry();
        self.bedTemp["name"](gettext("Bed"));
        self.bedTemp["key"]("bed");

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.temperature_profiles = self.settingsViewModel.temperature_profiles;
        self.temperature_cutoff = self.settingsViewModel.temperature_cutoff;

        self.heaterOptions = ko.observable({});

        self._printerProfileUpdated = function() {
            var graphColors = ["red", "orange", "green", "brown", "purple"];
            var heaterOptions = {};
            var tools = self.tools();

            // tools
            var numExtruders = self.settingsViewModel.printerProfiles.currentProfileData().extruder.count();
            if (numExtruders && numExtruders > 1) {
                // multiple extruders
                for (var extruder = 0; extruder < numExtruders; extruder++) {
                    var color = graphColors.shift();
                    if (!color) color = "black";
                    heaterOptions["tool" + extruder] = {name: "T" + extruder, color: color};

                    if (tools.length <= extruder || !tools[extruder]) {
                        tools[extruder] = self._createToolEntry();
                    }
                    tools[extruder]["name"](gettext("Tool") + " " + extruder);
                    tools[extruder]["key"]("tool" + extruder);
                }
            } else {
                // only one extruder, no need to add numbers
                var color = graphColors[0];
                heaterOptions["tool0"] = {name: "T", color: color};

                if (tools.length < 1 || !tools[0]) {
                    tools[0] = self._createToolEntry();
                }
                tools[0]["name"](gettext("Hotend"));
                tools[0]["key"]("tool0");
            }

            // print bed
            if (self.settingsViewModel.printerProfiles.currentProfileData().heatedBed()) {
                self.hasBed(true);
                heaterOptions["bed"] = {name: gettext("Bed"), color: "blue"};
            } else {
                self.hasBed(false);
            }

            // write back
            self.heaterOptions(heaterOptions);
            self.tools(tools);
        };
        self.settingsViewModel.printerProfiles.currentProfileData.subscribe(function() {
            self._printerProfileUpdated();
            self.settingsViewModel.printerProfiles.currentProfileData().extruder.count.subscribe(self._printerProfileUpdated);
            self.settingsViewModel.printerProfiles.currentProfileData().heatedBed.subscribe(self._printerProfileUpdated());
        });

        self.temperatures = [];
        self.plotOptions = {
            yaxis: {
                min: 0,
                max: 310,
                ticks: 10
            },
            xaxis: {
                mode: "time",
                minTickSize: [2, "minute"],
                tickFormatter: function(val, axis) {
                    if (val == undefined || val == 0)
                        return ""; // we don't want to display the minutes since the epoch if not connected yet ;)

                    // current time in milliseconds in UTC
                    var timestampUtc = Date.now();

                    // calculate difference in milliseconds
                    var diff = timestampUtc - val;

                    // convert to minutes
                    var diffInMins = Math.round(diff / (60 * 1000));
                    if (diffInMins == 0)
                        return gettext("just now");
                    else
                        return "- " + diffInMins + " " + gettext("min");
                }
            },
            legend: {
                position: "sw",
                noColumns: 2,
                backgroundOpacity: 0
            }
        };

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
            self._processTemperatureUpdateData(data.serverTime, data.temps);
            self._processOffsetData(data.offsets);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
            self._processTemperatureHistoryData(data.serverTime, data.temps);
            self._processOffsetData(data.offsets);
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self._processTemperatureUpdateData = function(serverTime, data) {
            if (data.length == 0)
                return;

            var lastData = data[data.length - 1];

            var tools = self.tools();
            for (var i = 0; i < tools.length; i++) {
                if (lastData.hasOwnProperty("tool" + i)) {
                    tools[i]["actual"](lastData["tool" + i].actual);
                    tools[i]["target"](lastData["tool" + i].target);
                }
            }

            if (lastData.hasOwnProperty("bed")) {
                self.bedTemp["actual"](lastData.bed.actual);
                self.bedTemp["target"](lastData.bed.target);
            }

            if (!CONFIG_TEMPERATURE_GRAPH) return;

            self.temperatures = self._processTemperatureData(serverTime, data, self.temperatures);
            self.updatePlot();
        };

        self._processTemperatureHistoryData = function(serverTime, data) {
            self.temperatures = self._processTemperatureData(serverTime, data);
            self.updatePlot();
        };

        self._processOffsetData = function(data) {
            var tools = self.tools();
            for (var i = 0; i < tools.length; i++) {
                if (data.hasOwnProperty("tool" + i)) {
                    tools[i]["offset"](data["tool" + i]);
                }
            }

            if (data.hasOwnProperty("bed")) {
                self.bedTemp["offset"](data["bed"]);
            }
        };

        self._processTemperatureData = function(serverTime, data, result) {
            var types = _.keys(self.heaterOptions());
            var clientTime = Date.now();

            // make sure result is properly initialized
            if (!result) {
                result = {};
            }

            _.each(types, function(type) {
                if (!result.hasOwnProperty(type)) {
                    result[type] = {actual: [], target: []};
                }
                if (!result[type].hasOwnProperty("actual")) result[type]["actual"] = [];
                if (!result[type].hasOwnProperty("target")) result[type]["target"] = [];
            });

            // convert data
            _.each(data, function(d) {
                var timeDiff = (serverTime - d.time) * 1000;
                var time = clientTime - timeDiff;
                _.each(types, function(type) {
                    if (!d[type]) return;
                    result[type].actual.push([time, d[type].actual]);
                    result[type].target.push([time, d[type].target]);
                })
            });

            var filterOld = function(item) {
                return item[0] >= clientTime - self.temperature_cutoff() * 60 * 1000;
            };

            _.each(_.keys(self.heaterOptions()), function(d) {
                result[d].actual = _.filter(result[d].actual, filterOld);
                result[d].target = _.filter(result[d].target, filterOld);
            });

            return result;
        };

        self.updatePlot = function() {
            var graph = $("#temperature-graph");
            if (graph.length) {
                var data = [];
                var heaterOptions = self.heaterOptions();
                if (!heaterOptions) return;

                _.each(_.keys(heaterOptions), function(type) {
                    if (type == "bed" && !self.hasBed()) {
                        return;
                    }

                    var actuals = [];
                    var targets = [];

                    if (self.temperatures[type]) {
                        actuals = self.temperatures[type].actual;
                        targets = self.temperatures[type].target;
                    }

                    var actualTemp = actuals && actuals.length ? formatTemperature(actuals[actuals.length - 1][1]) : "-";
                    var targetTemp = targets && targets.length ? formatTemperature(targets[targets.length - 1][1]) : "-";

                    data.push({
                        label: gettext("Actual") + " " + heaterOptions[type].name + ": " + actualTemp,
                        color: heaterOptions[type].color,
                        data: actuals
                    });
                    data.push({
                        label: gettext("Target") + " " + heaterOptions[type].name + ": " + targetTemp,
                        color: pusher.color(heaterOptions[type].color).tint(0.5).html(),
                        data: targets
                    });
                });

                $.plot(graph, data, self.plotOptions);
            }
        };

        self.setTarget = function(item) {
            var value = item.newTarget();
            if (!value) return;

            self._sendToolCommand("target",
                item.key(),
                item.newTarget(),
                function() {item.newTarget("");}
            );
        };

        self.setTargetFromProfile = function(item, profile) {
            if (!profile) return;

            var value = undefined;
            if (item.key() == "bed") {
                value = profile.bed;
            } else {
                value = profile.extruder;
            }

            self._sendToolCommand("target",
                item.key(),
                value,
                function() {item.newTarget("");}
            );
        };

        self.setTargetToZero = function(item) {
            self._sendToolCommand("target",
                item.key(),
                0,
                function() {item.newTarget("");}
            );
        };

        self.setOffset = function(item) {
            self._sendToolCommand("offset",
                item.key(),
                item.newOffset(),
                function() {item.newOffset("");}
            );
        };

        self._sendToolCommand = function(command, type, temp, successCb, errorCb) {
            var data = {
                command: command
            };

            var endpoint;
            if (type == "bed") {
                if ("target" == command) {
                    data["target"] = parseInt(temp);
                } else if ("offset" == command) {
                    data["offset"] = parseInt(temp);
                } else {
                    return;
                }

                endpoint = "bed";
            } else {
                var group;
                if ("target" == command) {
                    group = "targets";
                } else if ("offset" == command) {
                    group = "offsets";
                } else {
                    return;
                }
                data[group] = {};
                data[group][type] = parseInt(temp);

                endpoint = "tool";
            }

            $.ajax({
                url: API_BASEURL + "printer/" + endpoint,
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data),
                success: function() { if (successCb !== undefined) successCb(); },
                error: function() { if (errorCb !== undefined) errorCb(); }
            });

        };

        self.handleEnter = function(event, type, item) {
            if (event.keyCode == 13) {
                if (type == "target") {
                    self.setTarget(item);
                } else if (type == "offset") {
                    self.setOffset(item);
                }
            }
        };

        self.onAfterTabChange = function(current, previous) {
            if (current != "#temp") {
                return;
            }
            self.updatePlot();
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        TemperatureViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        "#temp"
    ]);
});

;

$(function() {
    function TerminalViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];

        // TODO remove with release of 1.3.0 and switch to RaionPi.coreui usage
        self.tabTracking = parameters[2];

        self.tabActive = false;

        self.log = ko.observableArray([]);
        self.log.extend({ throttle: 500 });
        self.plainLogLines = ko.observableArray([]);
        self.plainLogLines.extend({ throttle: 500 });

        self.buffer = ko.observable(300);
        self.upperLimit = ko.observable(1499);

        self.command = ko.observable(undefined);

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.autoscrollEnabled = ko.observable(true);

        self.filters = self.settings.terminalFilters;
        self.filterRegex = ko.observable();

        self.cmdHistory = [];
        self.cmdHistoryIdx = -1;

        self.enableFancyFunctionality = ko.observable(true);
        self.disableTerminalLogDuringPrinting = ko.observable(false);
        self.acceptableTime = 500;
        self.acceptableUnfancyTime = 300;

        self.forceFancyFunctionality = ko.observable(false);
        self.forceTerminalLogDuringPrinting = ko.observable(false);

        self.fancyFunctionality = ko.pureComputed(function() {
            return self.enableFancyFunctionality() || self.forceFancyFunctionality();
        });
        self.terminalLogDuringPrinting = ko.pureComputed(function() {
            return !self.disableTerminalLogDuringPrinting() || self.forceTerminalLogDuringPrinting();
        });

        self.displayedLines = ko.pureComputed(function() {
            if (!self.enableFancyFunctionality()) {
                return self.log();
            }

            var regex = self.filterRegex();
            var lineVisible = function(entry) {
                return regex == undefined || !entry.line.match(regex);
            };

            var filtered = false;
            var result = [];
            var lines = self.log();
            _.each(lines, function(entry) {
                if (lineVisible(entry)) {
                    result.push(entry);
                    filtered = false;
                } else if (!filtered) {
                    result.push(self._toInternalFormat("[...]", "filtered"));
                    filtered = true;
                }
            });

            return result;
        });

        self.plainLogOutput = ko.pureComputed(function() {
            if (self.fancyFunctionality()) {
                return;
            }
            return self.plainLogLines().join("\n");
        });

        self.lineCount = ko.pureComputed(function() {
            if (!self.fancyFunctionality()) {
                return;
            }

            var regex = self.filterRegex();
            var lineVisible = function(entry) {
                return regex == undefined || !entry.line.match(regex);
            };

            var lines = self.log();
            var total = lines.length;
            var displayed = _.filter(lines, lineVisible).length;
            var filtered = total - displayed;

            if (filtered > 0) {
                if (total > self.upperLimit()) {
                    return _.sprintf(gettext("showing %(displayed)d lines (%(filtered)d of %(total)d total lines filtered, buffer full)"), {displayed: displayed, total: total, filtered: filtered});
                } else {
                    return _.sprintf(gettext("showing %(displayed)d lines (%(filtered)d of %(total)d total lines filtered)"), {displayed: displayed, total: total, filtered: filtered});
                }
            } else {
                if (total > self.upperLimit()) {
                    return _.sprintf(gettext("showing %(displayed)d lines (buffer full)"), {displayed: displayed});
                } else {
                    return _.sprintf(gettext("showing %(displayed)d lines"), {displayed: displayed});
                }
            }
        });

        self.autoscrollEnabled.subscribe(function(newValue) {
            if (newValue) {
                self.log(self.log.slice(-self.buffer()));
            }
        });

        self.activeFilters = ko.observableArray([]);
        self.activeFilters.subscribe(function(e) {
            self.updateFilterRegex();
        });

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);

            var start = new Date().getTime();
            self._processCurrentLogData(data.logs);
            var end = new Date().getTime();

            var difference = end - start;
            if (self.enableFancyFunctionality()) {
                if (difference > self.acceptableTime) {
                    self.enableFancyFunctionality(false);
                    log.warn("Terminal: Detected slow client (needed " + difference + "ms for processing new log data), disabling fancy terminal functionality");
                }
            } else {
                if (!self.disableTerminalLogDuringPrinting() && difference > self.acceptableUnfancyTime) {
                    self.disableTerminalLogDuringPrinting(true);
                    log.warn("Terminal: Detected very slow client (needed " + difference + "ms for processing new log data), completely disabling terminal output during printing");
                }
            }
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
            self._processHistoryLogData(data.logs);
        };

        self._processCurrentLogData = function(data) {
            var length = self.log().length;
            if (length >= self.upperLimit()) {
                return;
            }

            if (!self.terminalLogDuringPrinting() && self.isPrinting()) {
                var last = self.plainLogLines()[self.plainLogLines().length - 1];
                var disabled = "--- client too slow, log output disabled while printing ---";
                if (last != disabled) {
                    self.plainLogLines.push(disabled);
                }
                return;
            }

            var newData = (data.length + length > self.upperLimit())
                ? data.slice(0, self.upperLimit() - length)
                : data;
            if (!newData) {
                return;
            }

            if (!self.fancyFunctionality()) {
                // lite version of the terminal - text output only
                self.plainLogLines(self.plainLogLines().concat(newData).slice(-self.buffer()));
                self.updateOutput();
                return;
            }

            var newLog = self.log().concat(_.map(newData, function(line) { return self._toInternalFormat(line) }));
            if (newData.length != data.length) {
                var cutoff = "--- too many lines to buffer, cut off ---";
                newLog.push(self._toInternalFormat(cutoff, "cut"));
            }

            if (self.autoscrollEnabled()) {
                // we only keep the last <buffer> entries
                newLog = newLog.slice(-self.buffer());
            }
            self.log(newLog);
            self.updateOutput();
        };

        self._processHistoryLogData = function(data) {
            self.plainLogLines(data);
            self.log(_.map(data, function(line) { return self._toInternalFormat(line) }));
            self.updateOutput();
        };

        self._toInternalFormat = function(line, type) {
            if (type == undefined) {
                type = "line";
            }
            return {line: line, type: type}
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self.updateFilterRegex = function() {
            var filterRegexStr = self.activeFilters().join("|").trim();
            if (filterRegexStr == "") {
                self.filterRegex(undefined);
            } else {
                self.filterRegex(new RegExp(filterRegexStr));
            }
            self.updateOutput();
        };

        self.updateOutput = function() {
            if (self.tabActive && self.tabTracking.browserTabVisible && self.autoscrollEnabled()) {
                self.scrollToEnd();
            }
        };

        self.toggleAutoscroll = function() {
            self.autoscrollEnabled(!self.autoscrollEnabled());
        };

        self.selectAll = function() {
            var container = self.fancyFunctionality() ? $("#terminal-output") : $("#terminal-output-lowfi");
            if (container.length) {
                container.selectText();
            }
        };

        self.scrollToEnd = function() {
            var container = self.fancyFunctionality() ? $("#terminal-output") : $("#terminal-output-lowfi");
            if (container.length) {
                container.scrollTop(container[0].scrollHeight);
            }
        };

        self.sendCommand = function() {
            var command = self.command();
            if (!command) {
                return;
            }

            var re = /^([gmt][0-9]+)(\s.*)?/;
            var commandMatch = command.match(re);
            if (commandMatch != null) {
                command = commandMatch[1].toUpperCase() + ((commandMatch[2] !== undefined) ? commandMatch[2] : "");
            }

            if (command) {
                $.ajax({
                    url: API_BASEURL + "printer/command",
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json; charset=UTF-8",
                    data: JSON.stringify({"command": command})
                });

                self.cmdHistory.push(command);
                self.cmdHistory.slice(-300); // just to set a sane limit to how many manually entered commands will be saved...
                self.cmdHistoryIdx = self.cmdHistory.length;
                self.command("");
            }
        };

        self.fakeAck = function() {
            $.ajax({
                url: API_BASEURL + "connection",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({"command": "fake_ack"})
            });
        };

        self.handleKeyDown = function(event) {
            var keyCode = event.keyCode;

            if (keyCode == 38 || keyCode == 40) {
                if (keyCode == 38 && self.cmdHistory.length > 0 && self.cmdHistoryIdx > 0) {
                    self.cmdHistoryIdx--;
                } else if (keyCode == 40 && self.cmdHistoryIdx < self.cmdHistory.length - 1) {
                    self.cmdHistoryIdx++;
                }

                if (self.cmdHistoryIdx >= 0 && self.cmdHistoryIdx < self.cmdHistory.length) {
                    self.command(self.cmdHistory[self.cmdHistoryIdx]);
                }

                // prevent the cursor from being moved to the beginning of the input field (this is actually the reason
                // why we do the arrow key handling in the keydown event handler, keyup would be too late already to
                // prevent this from happening, causing a jumpy cursor)
                return false;
            }

            // do not prevent default action
            return true;
        };

        self.handleKeyUp = function(event) {
            if (event.keyCode == 13) {
                self.sendCommand();
            }

            // do not prevent default action
            return true;
        };

        self.onAfterTabChange = function(current, previous) {
            self.tabActive = current == "#term";
            self.updateOutput();
        };

    }

    OCTOPRINT_VIEWMODELS.push([
        TerminalViewModel,
        ["loginStateViewModel", "settingsViewModel", "tabTracking"],
        "#term"
    ]);
});

;

$(function() {
    function TimelapseViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        self.defaultFps = 25;
        self.defaultPostRoll = 0;
        self.defaultInterval = 10;

        self.timelapseType = ko.observable(undefined);
        self.timelapseTimedInterval = ko.observable(self.defaultInterval);
        self.timelapsePostRoll = ko.observable(self.defaultPostRoll);
        self.timelapseFps = ko.observable(self.defaultFps);

        self.persist = ko.observable(false);
        self.isDirty = ko.observable(false);

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.isBusy = ko.pureComputed(function() {
            return self.isPrinting() || self.isPaused();
        });

        self.timelapseTypeSelected = ko.pureComputed(function() {
            return ("off" != self.timelapseType());
        });
        self.intervalInputEnabled = ko.pureComputed(function() {
            return ("timed" == self.timelapseType());
        });
        self.saveButtonEnabled = ko.pureComputed(function() {
            return self.isDirty() && self.isOperational() && !self.isPrinting() && self.loginState.isUser();
        });

        self.isOperational.subscribe(function(newValue) {
            self.requestData();
        });

        self.timelapseType.subscribe(function(newValue) {
            self.isDirty(true);
        });
        self.timelapseTimedInterval.subscribe(function(newValue) {
            self.isDirty(true);
        });
        self.timelapsePostRoll.subscribe(function(newValue) {
            self.isDirty(true);
        });
        self.timelapseFps.subscribe(function(newValue) {
            self.isDirty(true);
        });

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "timelapseFiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "creation": function(a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function(a, b) {
                    // sorts descending
                    if (a["bytes"] > b["bytes"]) return -1;
                    if (a["bytes"] < b["bytes"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            CONFIG_TIMELAPSEFILESPERPAGE
        );

        // initialize list helper for unrendered timelapses
        self.unrenderedListHelper = new ItemListHelper(
            "unrenderedTimelapseFiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "creation": function(a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function(a, b) {
                    // sorts descending
                    if (a["bytes"] > b["bytes"]) return -1;
                    if (a["bytes"] < b["bytes"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            CONFIG_TIMELAPSEFILESPERPAGE
        );

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "timelapse?unrendered=true",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.fromResponse = function(response) {
            var config = response.config;
            if (config === undefined) return;

            self.timelapseType(config.type);
            self.listHelper.updateItems(response.files);
            if (response.unrendered) {
                self.unrenderedListHelper.updateItems(response.unrendered);
            }

            if (config.type == "timed") {
                if (config.interval != undefined && config.interval > 0) {
                    self.timelapseTimedInterval(config.interval);
                }
            } else {
                self.timelapseTimedInterval(self.defaultInterval);
            }

            if (config.postRoll != undefined && config.postRoll >= 0) {
                self.timelapsePostRoll(config.postRoll);
            } else {
                self.timelapsePostRoll(self.defaultPostRoll);
            }

            if (config.fps != undefined && config.fps > 0) {
                self.timelapseFps(config.fps);
            } else {
                self.timelapseFps(self.defaultFps);
            }

            self.persist(false);
            self.isDirty(false);
        };

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self.removeFile = function(filename) {
            $.ajax({
                url: API_BASEURL + "timelapse/" + filename,
                type: "DELETE",
                dataType: "json",
                success: self.requestData
            });
        };

        self.removeUnrendered = function(name) {
            $.ajax({
                url: API_BASEURL + "timelapse/unrendered/" + name,
                type: "DELETE",
                dataType: "json",
                success: self.requestData
            });
        };

        self.renderUnrendered = function(name) {
            $.ajax({
                url: API_BASEURL + "timelapse/unrendered/" + name,
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({command: "render"})
            });
        };

        self.save = function(data, event) {
            var payload = {
                "type": self.timelapseType(),
                "postRoll": self.timelapsePostRoll(),
                "fps": self.timelapseFps(),
                "save": self.persist()
            };

            if (self.timelapseType() == "timed") {
                payload["interval"] = self.timelapseTimedInterval();
            }

            $.ajax({
                url: API_BASEURL + "timelapse",
                type: "POST",
                dataType: "json",
                data: payload,
                success: self.fromResponse
            });
        };

        self.onDataUpdaterReconnect = function() {
            self.requestData();
        };

        self.onEventMovieDone = function(payload) {
            self.requestData();
        };

        self.onStartup = function() {
            self.requestData();
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        TimelapseViewModel,
        ["loginStateViewModel"],
        "#timelapse"
    ]);
});

;

$(function() {
    function UsersViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "users",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "name",
            [],
            [],
            CONFIG_USERSPERPAGE
        );

        self.emptyUser = {name: "", admin: false, active: false};

        self.currentUser = ko.observable(self.emptyUser);

        self.editorUsername = ko.observable(undefined);
        self.editorPassword = ko.observable(undefined);
        self.editorRepeatedPassword = ko.observable(undefined);
        self.editorApikey = ko.observable(undefined);
        self.editorAdmin = ko.observable(undefined);
        self.editorActive = ko.observable(undefined);

        self.addUserDialog = undefined;
        self.editUserDialog = undefined;
        self.changePasswordDialog = undefined;

        self.currentUser.subscribe(function(newValue) {
            if (newValue === undefined) {
                self.editorUsername(undefined);
                self.editorAdmin(undefined);
                self.editorActive(undefined);
                self.editorApikey(undefined);
            } else {
                self.editorUsername(newValue.name);
                self.editorAdmin(newValue.admin);
                self.editorActive(newValue.active);
                self.editorApikey(newValue.apikey);
            }
            self.editorPassword(undefined);
            self.editorRepeatedPassword(undefined);
        });

        self.editorPasswordMismatch = ko.pureComputed(function() {
            return self.editorPassword() != self.editorRepeatedPassword();
        });

        self.requestData = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            $.ajax({
                url: API_BASEURL + "users",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.fromResponse = function(response) {
            self.listHelper.updateItems(response.users);
        };

        self.showAddUserDialog = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(undefined);
            self.editorActive(true);
            self.addUserDialog.modal("show");
        };

        self.confirmAddUser = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            var user = {name: self.editorUsername(), password: self.editorPassword(), admin: self.editorAdmin(), active: self.editorActive()};
            self.addUser(user, function() {
                // close dialog
                self.currentUser(undefined);
                self.addUserDialog.modal("hide");
            });
        };

        self.showEditUserDialog = function(user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(user);
            self.editUserDialog.modal("show");
        };

        self.confirmEditUser = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            var user = self.currentUser();
            user.active = self.editorActive();
            user.admin = self.editorAdmin();

            // make AJAX call
            self.updateUser(user, function() {
                // close dialog
                self.currentUser(undefined);
                self.editUserDialog.modal("hide");
            });
        };

        self.showChangePasswordDialog = function(user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.currentUser(user);
            self.changePasswordDialog.modal("show");
        };

        self.confirmChangePassword = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.updatePassword(self.currentUser().name, self.editorPassword(), function() {
                // close dialog
                self.currentUser(undefined);
                self.changePasswordDialog.modal("hide");
            });
        };

        self.confirmGenerateApikey = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.generateApikey(self.currentUser().name, function(response) {
                self._updateApikey(response.apikey);
            })
        };

        self.confirmDeleteApikey = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            self.deleteApikey(self.currentUser().name, function() {
                self._updateApikey(undefined);
            })
        };

        self._updateApikey = function(apikey) {
            self.editorApikey(apikey);
            self.requestData();
        };

        //~~ Framework

        self.onStartup = function() {
            self.addUserDialog = $("#settings-usersDialogAddUser");
            self.editUserDialog = $("#settings-usersDialogEditUser");
            self.changePasswordDialog = $("#settings-usersDialogChangePassword");
        };

        //~~ AJAX calls

        self.addUser = function(user, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;
            if (user === undefined) return;

            $.ajax({
                url: API_BASEURL + "users",
                type: "POST",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(user),
                success: function(response) {
                    self.fromResponse(response);
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.removeUser = function(user, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;
            if (user === undefined) return;

            if (user.name == self.loginState.username()) {
                // we do not allow to delete ourselves
                new PNotify({title: "Not possible", text: "You may not delete your own account.", type: "error"});
                return;
            }

            $.ajax({
                url: API_BASEURL + "users/" + user.name,
                type: "DELETE",
                success: function(response) {
                    self.fromResponse(response);
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.updateUser = function(user, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;
            if (user === undefined) return;

            $.ajax({
                url: API_BASEURL + "users/" + user.name,
                type: "PUT",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(user),
                success: function(response) {
                    self.fromResponse(response);
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.updatePassword = function(username, password, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;

            $.ajax({
                url: API_BASEURL + "users/" + username + "/password",
                type: "PUT",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({password: password}),
                success: function(response) {
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.generateApikey = function(username, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;

            $.ajax({
                url: API_BASEURL + "users/" + username + "/apikey",
                type: "POST",
                success: function(response) {
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.deleteApikey = function(username, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;

            $.ajax({
                url: API_BASEURL + "users/" + username + "/apikey",
                type: "DELETE",
                success: function(response) {
                    if (callback) {
                        callback(response);
                    }
                }
            });
        };

        self.onUserLoggedIn = function(user) {
            if (user.admin) {
                self.requestData();
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        UsersViewModel,
        ["loginStateViewModel"],
        []
    ]);
});

;

$(function() {
    function LogViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "logFiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "modification": function(a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function(a, b) {
                    // sorts descending
                    if (a["size"] > b["size"]) return -1;
                    if (a["size"] < b["size"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            CONFIG_LOGFILESPERPAGE
        );

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "logs",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.fromResponse = function(response) {
            var files = response.files;
            if (files === undefined)
                return;

            self.listHelper.updateItems(files);
        };

        self.removeFile = function(filename) {
            $.ajax({
                url: API_BASEURL + "logs/" + filename,
                type: "DELETE",
                dataType: "json",
                success: self.requestData
            });
        };

        self.onUserLoggedIn = function(user) {
            if (user.admin) {
                self.requestData();
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        LogViewModel,
        ["loginStateViewModel"],
        "#logs"
    ]);
});
;

$(function() {
    function UserSettingsViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.users = parameters[1];

        self.userSettingsDialog = undefined;

        var auto_locale = {language: "_default", display: gettext("Site default"), english: undefined};
        self.locales = ko.observableArray([auto_locale].concat(_.sortBy(_.values(AVAILABLE_LOCALES), function(n) {
            return n.display;
        })));
        self.locale_languages = _.keys(AVAILABLE_LOCALES);

        self.access_password = ko.observable(undefined);
        self.access_repeatedPassword = ko.observable(undefined);
        self.access_apikey = ko.observable(undefined);
        self.interface_language = ko.observable(undefined);

        self.currentUser = ko.observable(undefined);
        self.currentUser.subscribe(function(newUser) {
            self.access_password(undefined);
            self.access_repeatedPassword(undefined);
            self.access_apikey(undefined);
            self.interface_language("_default");

            if (newUser != undefined) {
                self.access_apikey(newUser.apikey);
                if (newUser.settings.hasOwnProperty("interface") && newUser.settings.interface.hasOwnProperty("language")) {
                    self.interface_language(newUser.settings.interface.language);
                }
            }
        });

        self.passwordMismatch = ko.pureComputed(function() {
            return self.access_password() != self.access_repeatedPassword();
        });

        self.show = function(user) {
            if (!CONFIG_ACCESS_CONTROL) return;

            if (user == undefined) {
                user = self.loginState.currentUser();
            }

            self.currentUser(user);
            self.userSettingsDialog.modal("show");
        };

        self.save = function() {
            if (!CONFIG_ACCESS_CONTROL) return;

            if (self.access_password() && !self.passwordMismatch()) {
                self.users.updatePassword(self.currentUser().name, self.access_password(), function(){});
            }

            var settings = {
                "interface": {
                    "language": self.interface_language()
                }
            };
            self.updateSettings(self.currentUser().name, settings, function() {
                // close dialog
                self.currentUser(undefined);
                self.userSettingsDialog.modal("hide");
                self.loginState.reloadUser();
            });
        };

        self.updateSettings = function(username, settings, callback) {
            if (!CONFIG_ACCESS_CONTROL) return;

            $.ajax({
                url: API_BASEURL + "users/" + username + "/settings",
                type: "PATCH",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(settings),
                success: callback
            });
        };

        self.saveEnabled = function() {
            return !self.passwordMismatch();
        };

        self.onStartup = function() {
            self.userSettingsDialog = $("#usersettings_dialog");
        };

        self.onAllBound = function(allViewModels) {
            self.userSettingsDialog.on('show', function() {
                _.each(allViewModels, function(viewModel) {
                    if (viewModel.hasOwnProperty("onUserSettingsShown")) {
                        viewModel.onUserSettingsShown();
                    }
                });
            });
            self.userSettingsDialog.on('hidden', function() {
                _.each(allViewModels, function(viewModel) {
                    if (viewModel.hasOwnProperty("onUserSettingsHidden")) {
                        viewModel.onUserSettingsHidden();
                    }
                });
            });
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        UserSettingsViewModel,
        ["loginStateViewModel", "usersViewModel"],
        ["#usersettings_dialog"]
    ]);
});

;

$(function() {
    function AboutViewModel(parameters) {
        var self = this;

        self.aboutDialog = undefined;
        self.aboutContent = undefined;
        self.aboutTabs = undefined;

        self.show = function() {
            $("a:first", self.aboutTabs).tab("show");
            self.aboutContent.scrollTop(0);
            self.aboutDialog.modal({
                minHeight: function() { return Math.max($.fn.modal.defaults.maxHeight() - 80, 250); }
            }).css({
                width: 'auto',
                'margin-left': function() { return -($(this).width() /2); }
            });
            return false;
        };

        self.hide = function() {
            self.aboutDialog.modal("hide");
        };

        self.onStartup = function() {
            self.aboutDialog = $("#about_dialog");
            self.aboutTabs = $("#about_dialog_tabs");
            self.aboutContent = $("#about_dialog_content");

            $('a[data-toggle="tab"]', self.aboutTabs).on("show", function() {
                self.aboutContent.scrollTop(0);
            });
        };

        self.showTab = function(tab) {
            $("a[href=#" + tab + "]", self.aboutTabs).tab("show");
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        AboutViewModel,
        [],
        ["#about_dialog", "#footer_about"]
    ]);
});

;

/*! jQuery UI Virtual Keyboard v1.25.25 */
!function(a){"function"==typeof define&&define.amd?define(["jquery"],a):"object"==typeof module&&"object"==typeof module.exports?module.exports=a(require("jquery")):a(jQuery)}(function(a){"use strict";var b=a.keyboard=function(c,d){var e,f=this;f.version="1.25.25",f.$el=a(c),f.el=c,f.$el.data("keyboard",f),f.init=function(){var c,g,h,i=b.css,j=b.events;f.settings=d||{},d&&d.position&&(g=a.extend({},d.position),d.position=null),f.options=e=a.extend(!0,{},b.defaultOptions,d),g&&(e.position=g,d.position=g),f.el.active=!0,f.namespace=".keyboard"+Math.random().toString(16).slice(2),f.extensionNamespace=[],f.shiftActive=f.altActive=f.metaActive=f.sets=f.capsLock=!1,f.rows=["","-shift","-alt","-alt-shift"],f.inPlaceholder=f.$el.attr("placeholder")||"",f.watermark=b.watermark&&""!==f.inPlaceholder,f.repeatTime=1e3/(e.repeatRate||20),e.preventDoubleEventTime=e.preventDoubleEventTime||100,f.isOpen=!1,f.wheel=a.isFunction(a.fn.mousewheel),f.escapeRegex=/[-\/\\^$*+?.()|[\]{}]/g,c=b.keyCodes,f.alwaysAllowed=[c.capsLock,c.pageUp,c.pageDown,c.end,c.home,c.left,c.up,c.right,c.down,c.insert,c["delete"]],f.$keyboard=[],f.enabled=!0,a.isEmptyObject(e.position)||(e.position.orig_at=e.position.at),f.checkCaret=e.lockInput||b.checkCaretSupport(),f.last={start:0,end:0,key:"",val:"",preVal:"",layout:"",virtual:!0,keyset:[!1,!1,!1],wheel_$Keys:null,wheelIndex:0,wheelLayers:[]},f.temp=["",0,0],a.each([j.kbInit,j.kbBeforeVisible,j.kbVisible,j.kbHidden,j.inputCanceled,j.inputAccepted,j.kbBeforeClose],function(b,c){a.isFunction(e[c])&&f.$el.bind(c+f.namespace+"callbacks",e[c])}),e.alwaysOpen&&(e.stayOpen=!0),h=a(document),f.el.ownerDocument!==document&&(h=h.add(f.el.ownerDocument)),h.bind("mousedown keyup touchstart checkkeyboard ".split(" ").join(f.namespace+" "),f.checkClose),f.$el.addClass(i.input+" "+e.css.input).attr({"aria-haspopup":"true",role:"textbox"}),(e.lockInput||f.el.readOnly)&&(e.lockInput=!0,f.$el.addClass(i.locked).attr({readonly:"readonly"})),(f.$el.is(":disabled")||f.$el.attr("readonly")&&!f.$el.hasClass(i.locked))&&f.$el.addClass(i.noKeyboard),e.openOn&&f.bindFocus(),f.watermark||""!==f.$el.val()||""===f.inPlaceholder||""===f.$el.attr("placeholder")||f.$el.addClass(i.placeholder).val(f.inPlaceholder),f.$el.trigger(j.kbInit,[f,f.el]),e.alwaysOpen&&f.reveal()},f.toggle=function(){var a=f.$keyboard.find("."+b.css.keyToggle),c=!f.enabled;f.$preview.prop("readonly",c||f.options.lockInput),f.$keyboard.toggleClass(b.css.keyDisabled,c).find("."+b.css.keyButton).not(a).prop("disabled",c).attr("aria-disabled",c),a.toggleClass(b.css.keyDisabled,c),c&&f.typing_options&&(f.typing_options.text="")},f.setCurrent=function(){var c=b.css,d=a("."+c.isCurrent),e=d.data("keyboard");a.isEmptyObject(e)||e.el===f.el||e.close(e.options.autoAccept?"true":!1),d.removeClass(c.isCurrent),a("."+c.hasFocus).removeClass(c.hasFocus),f.$el.addClass(c.isCurrent),f.$keyboard.addClass(c.hasFocus),f.isCurrent(!0),f.isOpen=!0},f.isCurrent=function(a){var c=b.currentKeyboard||!1;return a?c=b.currentKeyboard=f.el:a===!1&&c===f.el&&(c=b.currentKeyboard=""),c===f.el},f.isVisible=function(){return f.$keyboard&&f.$keyboard.length?f.$keyboard.is(":visible"):!1},f.focusOn=function(){!f&&f.el.active||f.isVisible()||(clearTimeout(f.timer),f.reveal())},f.redraw=function(){f.$keyboard.length&&(f.last.preVal=""+f.last.val,f.last.val=f.$preview&&f.$preview.val()||f.$el.val(),f.$el.val(f.last.val),f.removeKeyboard(),f.shiftActive=f.altActive=f.metaActive=!1),f.isOpen=e.alwaysOpen,f.reveal(!0)},f.reveal=function(c){var d=f.isOpen,g=b.css;return f.opening=!d,a("."+g.keyboard).not("."+g.alwaysOpen).each(function(){var b=a(this).data("keyboard");a.isEmptyObject(b)||b.close(b.options.autoAccept&&b.options.autoAcceptOnEsc?"true":!1)}),f.$el.is(":disabled")||f.$el.attr("readonly")&&!f.$el.hasClass(g.locked)?void f.$el.addClass(g.noKeyboard):(f.$el.removeClass(g.noKeyboard),e.openOn&&f.$el.unbind(a.trim((e.openOn+" ").split(/\s+/).join(f.namespace+" "))),f.$keyboard&&(!f.$keyboard||f.$keyboard.length&&!a.contains(document.body,f.$keyboard[0]))||f.startup(),f.watermark||f.el.value!==f.inPlaceholder||f.$el.removeClass(g.placeholder).val(""),f.originalContent=f.$el.val(),f.$preview.val(f.originalContent),e.acceptValid&&f.checkValid(),e.resetDefault&&(f.shiftActive=f.altActive=f.metaActive=!1),f.showSet(),f.isVisible()||f.$el.trigger(b.events.kbBeforeVisible,[f,f.el]),f.setCurrent(),f.toggle(),f.$keyboard.show(),e.usePreview&&b.msie&&("undefined"==typeof f.width&&(f.$preview.hide(),f.width=Math.ceil(f.$keyboard.width()),f.$preview.show()),f.$preview.width(f.width)),f.position=a.isEmptyObject(e.position)?!1:e.position,a.ui&&a.ui.position&&f.position&&(f.position.of=f.position.of||f.$el.data("keyboardPosition")||f.$el,f.position.collision=f.position.collision||"flipfit flipfit",e.position.at=e.usePreview?e.position.orig_at:e.position.at2,f.$keyboard.position(f.position)),f.checkDecimal(),f.lineHeight=parseInt(f.$preview.css("lineHeight"),10)||parseInt(f.$preview.css("font-size"),10)+4,e.caretToEnd&&f.saveCaret(f.originalContent.length,f.originalContent.length),b.allie&&(0===f.last.end&&f.last.start>0&&(f.last.end=f.last.start),f.last.start<0&&(f.last.start=f.last.end=f.originalContent.length)),d||c?(b.caret(f.$preview,f.last),f):(f.timer2=setTimeout(function(){var a;f.opening=!1,/(number|email)/i.test(f.el.type)||e.caretToEnd||f.saveCaret(a,a,f.$el),e.initialFocus&&b.caret(f.$preview,f.last),f.last.eventTime=(new Date).getTime(),f.$el.trigger(b.events.kbVisible,[f,f.el]),f.timer=setTimeout(function(){f&&f.saveCaret()},200)},10),f))},f.updateLanguage=function(){var c=b.layouts,d=e.language||c[e.layout]&&c[e.layout].lang&&c[e.layout].lang||[e.language||"en"],g=b.language;d=(a.isArray(d)?d[0]:d).split("-")[0],e.display=a.extend(!0,{},g.en.display,g[d]&&g[d].display||{},f.settings.display),e.combos=a.extend(!0,{},g.en.combos,g[d]&&g[d].combos||{},f.settings.combos),e.wheelMessage=g[d]&&g[d].wheelMessage||g.en.wheelMessage,e.rtl=c[e.layout]&&c[e.layout].rtl||g[d]&&g[d].rtl||!1,f.regex=g[d]&&g[d].comboRegex||b.comboRegex,f.decimal=/^\./.test(e.display.dec),f.$el.toggleClass("rtl",e.rtl).css("direction",e.rtl?"rtl":"")},f.startup=function(){var c=b.css;(e.alwaysOpen||e.userClosed)&&f.$preview||f.makePreview(),f.$keyboard&&f.$keyboard.length||("custom"===e.layout&&(e.layoutHash="custom"+f.customHash()),f.layout="custom"===e.layout?e.layoutHash:e.layout,f.last.layout=f.layout,f.updateLanguage(),"undefined"==typeof b.builtLayouts[f.layout]&&(a.isFunction(e.create)?f.$keyboard=e.create(f):f.$keyboard.length||f.buildKeyboard(f.layout,!0)),f.$keyboard=b.builtLayouts[f.layout].$keyboard.clone(),f.$keyboard.data("keyboard",f),""!==(f.el.id||"")&&f.$keyboard.attr("id",f.el.id+b.css.idSuffix),f.makePreview(),e.usePreview?a.isEmptyObject(e.position)||(e.position.at=e.position.orig_at):a.isEmptyObject(e.position)||(e.position.at=e.position.at2)),f.$decBtn=f.$keyboard.find("."+c.keyPrefix+"dec"),(e.enterNavigation||"TEXTAREA"===f.el.nodeName)&&f.alwaysAllowed.push(13),f.bindKeyboard(),f.$keyboard.appendTo(e.appendLocally?f.$el.parent():e.appendTo||"body"),f.bindKeys(),e.reposition&&a.ui&&a.ui.position&&"body"==e.appendTo&&a(window).bind("resize"+f.namespace,function(){f.position&&f.isVisible()&&f.$keyboard.position(f.position)})},f.makePreview=function(){if(e.usePreview){var c,d,g,h,i=b.css;for(f.$preview=f.$el.clone(!1).data("keyboard",f).removeClass(i.placeholder+" "+i.input).addClass(i.preview+" "+e.css.input).attr("tabindex","-1").show(),f.preview=f.$preview[0],"number"===f.preview.type&&(f.preview.type="text"),h=/^(data-|id|aria-haspopup)/i,d=f.$preview.get(0).attributes,c=d.length-1;c>=0;c--)g=d[c]&&d[c].name,h.test(g)&&f.preview.removeAttribute(g);a("<div />").addClass(i.wrapper).append(f.$preview).prependTo(f.$keyboard)}else f.$preview=f.$el,f.preview=f.el},f.saveCaret=function(a,c,d){var e=b.caret(d||f.$preview,a,c);f.last.start="undefined"==typeof a?e.start:a,f.last.end="undefined"==typeof c?e.end:c},f.setScroll=function(){if(f.last.virtual){var a,c,d,g,h="TEXTAREA"===f.preview.nodeName,i=f.last.val.substring(0,Math.max(f.last.start,f.last.end));f.$previewCopy||(f.$previewCopy=f.$preview.clone().removeAttr("id").css({position:"absolute",left:0,zIndex:-10,visibility:"hidden"}).addClass(b.css.inputClone),h||f.$previewCopy.css({"white-space":"pre",width:0}),e.usePreview?f.$preview.after(f.$previewCopy):f.$keyboard.prepend(f.$previewCopy)),h?(f.$previewCopy.height(f.lineHeight).val(i),f.preview.scrollTop=f.lineHeight*(Math.floor(f.$previewCopy[0].scrollHeight/f.lineHeight)-1)):(f.$previewCopy.val(i.replace(/\s/g," ")),d=/c/i.test(e.scrollAdjustment)?f.preview.clientWidth/2:e.scrollAdjustment,a=f.$previewCopy[0].scrollWidth-1,"undefined"==typeof f.last.scrollWidth&&(f.last.scrollWidth=a,f.last.direction=!0),g=f.last.scrollWidth===a?f.last.direction:f.last.scrollWidth<a,c=f.preview.clientWidth-d,g?c>a?f.preview.scrollLeft=0:f.preview.scrollLeft=a-c:a>=f.preview.scrollWidth-c?f.preview.scrollLeft=f.preview.scrollWidth-d:a-d>0?f.preview.scrollLeft=a-d:f.preview.scrollLeft=0,f.last.scrollWidth=a,f.last.direction=g)}},f.bindFocus=function(){e.openOn&&f&&f.el.active&&(f.$el.bind(e.openOn+f.namespace,function(){f.focusOn()}),a(":focus")[0]===f.el&&f.$el.blur())},f.bindKeyboard=function(){var c,d=b.keyCodes,g=b.builtLayouts[f.layout];f.$preview.unbind(f.namespace).bind("click"+f.namespace+" touchstart"+f.namespace,function(){e.alwaysOpen&&!f.isCurrent()&&f.reveal(),f.timer2=setTimeout(function(){f&&f.saveCaret()},150)}).bind("keypress"+f.namespace,function(h){if(e.lockInput)return!1;var i=h.charCode||h.which,j=i>=d.A&&i<=d.Z,k=i>=d.a&&i<=d.z,l=f.last.key=String.fromCharCode(i);if(f.last.virtual=!1,f.last.event=h,f.last.$key=[],f.checkCaret&&f.saveCaret(),i!==d.capsLock&&(j||k)&&(f.capsLock=j&&!h.shiftKey||k&&h.shiftKey,f.capsLock&&!f.shiftActive&&(f.shiftActive=!0,f.showSet())),e.restrictInput){if((h.which===d.backSpace||0===h.which)&&a.inArray(h.keyCode,f.alwaysAllowed))return;-1===a.inArray(l,g.acceptedKeys)&&(h.preventDefault(),c=a.extend({},h),c.type=b.events.inputRestricted,f.$el.trigger(c,[f,f.el]),a.isFunction(e.restricted)&&e.restricted(c,f,f.el))}else if((h.ctrlKey||h.metaKey)&&(h.which===d.A||h.which===d.C||h.which===d.V||h.which>=d.X&&h.which<=d.Z))return;g.hasMappedKeys&&g.mappedKeys.hasOwnProperty(l)&&(f.last.key=g.mappedKeys[l],f.insertText(f.last.key),h.preventDefault()),f.checkMaxLength()}).bind("keyup"+f.namespace,function(c){switch(f.last.virtual=!1,c.which){case d.tab:if(f.tab&&e.tabNavigation&&!e.lockInput){f.shiftActive=c.shiftKey;var g=b.keyaction.tab(f);if(f.tab=!1,!g)return!1}else c.preventDefault();break;case d.escape:return e.ignoreEsc||f.close(e.autoAccept&&e.autoAcceptOnEsc?"true":!1),!1}return clearTimeout(f.throttled),f.throttled=setTimeout(function(){f&&f.isVisible()&&f.checkCombos()},100),f.checkMaxLength(),f.last.preVal=""+f.last.val,f.last.val=f.$preview.val(),c.type=b.events.kbChange,c.action=f.last.key,f.$el.trigger(c,[f,f.el]),a.isFunction(e.change)?(c.type=b.events.inputChange,e.change(c,f,f.el),!1):void 0}).bind("keydown"+f.namespace,function(a){if(e.alwaysOpen&&!f.isCurrent()&&f.reveal(),a.which===d.tab)return f.tab=!0,!1;if(e.lockInput)return!1;switch(f.last.virtual=!1,a.which){case d.backSpace:b.keyaction.bksp(f,null,a),a.preventDefault();break;case d.enter:b.keyaction.enter(f,null,a);break;case d.capsLock:f.shiftActive=f.capsLock=!f.capsLock,f.showSet();break;case d.V:if(a.ctrlKey||a.metaKey){if(e.preventPaste)return void a.preventDefault();f.checkCombos()}}}).bind("mouseup touchend ".split(" ").join(f.namespace+" "),function(){f.last.virtual=!0,f.saveCaret()}),f.$keyboard.bind("mousedown click touchstart ".split(" ").join(f.namespace+" "),function(b){b.stopPropagation(),f.isCurrent()||(f.reveal(),a(document).trigger("checkkeyboard"+f.namespace)),e.noFocus||f.$preview.focus()}),e.preventPaste&&(f.$preview.bind("contextmenu"+f.namespace,function(a){a.preventDefault()}),f.$el.bind("contextmenu"+f.namespace,function(a){a.preventDefault()}))},f.bindKeys=function(){var c=b.css;f.$allKeys=f.$keyboard.find("button."+c.keyButton).unbind(f.namespace+" "+f.namespace+"kb").bind("mouseenter mouseleave touchstart ".split(" ").join(f.namespace+" "),function(c){if(!e.alwaysOpen&&!e.userClosed||"mouseleave"===c.type||f.isCurrent()||(f.reveal(),f.$preview.focus(),b.caret(f.$preview,f.last)),f.isCurrent()){var d,g,h=f.last,i=a(this),j=c.type;e.useWheel&&f.wheel&&(d=f.getLayers(i),g=(d.length?d.map(function(){return a(this).attr("data-value")||""}).get():"")||[i.text()],h.wheel_$Keys=d,h.wheelLayers=g,h.wheelIndex=a.inArray(i.attr("data-value"),g)),"mouseenter"!==j&&"touchstart"!==j||"password"===f.el.type||i.hasClass(e.css.buttonDisabled)||(i.addClass(e.css.buttonHover),e.useWheel&&f.wheel&&i.attr("title",function(a,b){return f.wheel&&""===b&&f.sets&&g.length>1&&"touchstart"!==j?e.wheelMessage:b})),"mouseleave"===j&&(i.removeClass("password"===f.el.type?"":e.css.buttonHover),e.useWheel&&f.wheel&&(h.wheelIndex=0,h.wheelLayers=[],h.wheel_$Keys=null,i.attr("title",function(a,b){return b===e.wheelMessage?"":b}).html(i.attr("data-html"))))}}).bind(e.keyBinding.split(" ").join(f.namespace+" ")+f.namespace+" "+b.events.kbRepeater,function(d){if(d.preventDefault(),!f.$keyboard.is(":visible"))return!1;var g,h,i=f.last,j=this,k=a(j),l=(new Date).getTime();if(e.useWheel&&f.wheel&&(h=i.wheel_$Keys,k=h&&i.wheelIndex>-1?h.eq(i.wheelIndex):k),g=k.attr("data-action"),!(l-(i.eventTime||0)<e.preventDoubleEventTime)){if(i.eventTime=l,i.event=d,i.virtual=!0,e.noFocus||f.$preview.focus(),i.$key=k,i.key=k.attr("data-value"),f.checkCaret&&b.caret(f.$preview,i),g.match("meta")&&(g="meta"),g===i.key&&"string"==typeof b.keyaction[g])i.key=g=b.keyaction[g];else if(g in b.keyaction&&a.isFunction(b.keyaction[g])){if(b.keyaction[g](f,this,d)===!1)return!1;g=null}return"undefined"!=typeof g&&null!==g&&(i.key=a(this).hasClass(c.keyAction)?g:i.key,f.insertText(i.key),f.capsLock||e.stickyShift||d.shiftKey||(f.shiftActive=!1,f.showSet(k.attr("data-name")))),b.caret(f.$preview,i),f.checkCombos(),d.type=b.events.kbChange,d.action=i.key,f.$el.trigger(d,[f,f.el]),i.preVal=""+i.val,i.val=f.$preview.val(),a.isFunction(e.change)?(d.type=b.events.inputChange,e.change(d,f,f.el),!1):void 0}}).bind("mouseup"+f.namespace+" "+"mouseleave touchend touchmove touchcancel ".split(" ").join(f.namespace+"kb "),function(c){f.last.virtual=!0;var d,g=a(this);if("touchmove"===c.type){if(d=g.offset(),d.right=d.left+g.outerWidth(),d.bottom=d.top+g.outerHeight(),c.originalEvent.touches[0].pageX>=d.left&&c.originalEvent.touches[0].pageX<d.right&&c.originalEvent.touches[0].pageY>=d.top&&c.originalEvent.touches[0].pageY<d.bottom)return!0}else/(mouseleave|touchend|touchcancel)/i.test(c.type)?g.removeClass(e.css.buttonHover):(!e.noFocus&&f.isVisible()&&f.isCurrent()&&f.$preview.focus(),f.checkCaret&&b.caret(f.$preview,f.last));return f.mouseRepeat=[!1,""],clearTimeout(f.repeater),!1}).bind("click"+f.namespace,function(){return!1}).not("."+c.keyAction).bind("mousewheel"+f.namespace,function(b,c){if(e.useWheel&&f.wheel){c=c||b.deltaY;var d,g=f.last.wheelLayers||[];return g.length>1?(d=f.last.wheelIndex+(c>0?-1:1),d>g.length-1&&(d=0),0>d&&(d=g.length-1)):d=0,f.last.wheelIndex=d,a(this).html(g[d]),!1}}).add("."+c.keyPrefix+"tab bksp space enter".split(" ").join(",."+c.keyPrefix),f.$keyboard).bind("mousedown touchstart ".split(" ").join(f.namespace+"kb "),function(){if(0!==e.repeatRate){var b=a(this);f.mouseRepeat=[!0,b],setTimeout(function(){f&&f.mouseRepeat[0]&&f.mouseRepeat[1]===b&&!b[0].disabled&&f.repeatKey(b)},e.repeatDelay)}return!1})},f.insertText=function(a){if("undefined"!=typeof a){var c,d,e="\b"===a,g=f.$preview.val(),h=b.caret(f.$preview),i=g.length;h.end<h.start&&(h.end=h.start),h.start>i&&(h.end=h.start=i),"TEXTAREA"===f.preview.nodeName&&b.msie&&"\n"===g.substr(h.start,1)&&(h.start+=1,h.end+=1),"{d}"===a&&(a="",d=h.start,h.end+=1),c=e&&h.start===h.end,a=e?"":a,g=g.substr(0,h.start-(c?1:0))+a+g.substr(h.end),d=h.start+(c?-1:a.length),f.$preview.val(g),f.saveCaret(d,d),f.setScroll()}},f.checkMaxLength=function(){var a,c,d=f.$preview.val();e.maxLength!==!1&&d.length>e.maxLength&&(a=b.caret(f.$preview).start,c=Math.min(a,e.maxLength),e.maxInsert||(d=f.last.val,c=a-1),f.$preview.val(d.substring(0,e.maxLength)),f.saveCaret(c,c)),f.$decBtn.length&&f.checkDecimal()},f.repeatKey=function(a){a.trigger(b.events.kbRepeater),f.mouseRepeat[0]&&(f.repeater=setTimeout(function(){f&&f.repeatKey(a)},f.repeatTime))},f.showKeySet=function(a){"string"==typeof a?(f.last.keyset=[f.shiftActive,f.altActive,f.metaActive],f.shiftActive=/shift/i.test(a),f.altActive=/alt/i.test(a),/meta/.test(a)?(f.metaActive=!0,f.showSet(a.match(/meta\d+/i)[0])):(f.metaActive=!1,f.showSet())):f.showSet(a)},f.showSet=function(a){e=f.options;var c=b.css,d="."+c.keyPrefix,g=e.css.buttonActive,h="",i=(f.shiftActive?1:0)+(f.altActive?2:0);return f.shiftActive||(f.capsLock=!1),f.metaActive?(h=/meta/i.test(a)?a:"",""===h?h=f.metaActive===!0?"":f.metaActive:f.metaActive=h,(!e.stickyShift&&f.last.keyset[2]!==f.metaActive||(f.shiftActive||f.altActive)&&!f.$keyboard.find("."+c.keySet+"-"+h+f.rows[i]).length)&&(f.shiftActive=f.altActive=!1)):!e.stickyShift&&f.last.keyset[2]!==f.metaActive&&f.shiftActive&&(f.shiftActive=f.altActive=!1),i=(f.shiftActive?1:0)+(f.altActive?2:0),h=0!==i||f.metaActive?""===h?"":"-"+h:"-normal",f.$keyboard.find("."+c.keySet+h+f.rows[i]).length?(f.$keyboard.find(d+"alt,"+d+"shift,."+c.keyAction+"[class*=meta]").removeClass(g).end().find(d+"alt").toggleClass(g,f.altActive).end().find(d+"shift").toggleClass(g,f.shiftActive).end().find(d+"lock").toggleClass(g,f.capsLock).end().find("."+c.keySet).hide().end().find("."+c.keyAction+d+h).addClass(g),f.$keyboard.find("."+c.keySet+h+f.rows[i])[0].style.display="inline-block",f.metaActive&&f.$keyboard.find(d+f.metaActive).toggleClass(g,f.metaActive!==!1),f.last.keyset=[f.shiftActive,f.altActive,f.metaActive],void f.$el.trigger(b.events.kbKeysetChange,[f,f.el])):(f.shiftActive=f.last.keyset[0],f.altActive=f.last.keyset[1],void(f.metaActive=f.last.keyset[2]))},f.checkCombos=function(){if(!f.isVisible()&&!f.$keyboard.hasClass(b.css.hasFocus))return f.$preview.val();var c,d,g,h=f.$preview.val(),i=b.caret(f.$preview),j=b.builtLayouts[f.layout],k=h.length;return""===h?(e.acceptValid&&f.checkValid(),h):(i.end<i.start&&(i.end=i.start),i.start>k&&(i.end=i.start=k),b.msie&&"\n"===h.substr(i.start,1)&&(i.start+=1,i.end+=1),e.useCombos&&(b.msie?h=h.replace(f.regex,function(a,b,c){return e.combos.hasOwnProperty(b)?e.combos[b][c]||a:a}):f.$preview.length&&(d=i.start-(i.start-2>=0?2:0),b.caret(f.$preview,d,i.end),g=(b.caret(f.$preview).text||"").replace(f.regex,function(a,b,c){return e.combos.hasOwnProperty(b)?e.combos[b][c]||a:a}),f.$preview.val(b.caret(f.$preview).replaceStr(g)),h=f.$preview.val())),e.restrictInput&&""!==h&&(d=j.acceptedKeys.length,c=j.acceptedKeysRegex,c||(g=a.map(j.acceptedKeys,function(a){return a.replace(f.escapeRegex,"\\$&")}),c=j.acceptedKeysRegex=new RegExp("("+g.join("|")+")","g")),g=h.match(c),g?h=g.join(""):(h="",k=0)),i.start+=h.length-k,i.end+=h.length-k,f.$preview.val(h),f.saveCaret(i.start,i.end),f.setScroll(),f.checkMaxLength(),e.acceptValid&&f.checkValid(),h)},f.checkValid=function(){var c=b.css,d=f.$keyboard.find("."+c.keyPrefix+"accept"),g=!0;a.isFunction(e.validate)&&(g=e.validate(f,f.$preview.val(),!1)),d.toggleClass(c.inputInvalid,!g).toggleClass(c.inputValid,g).attr("title",d.attr("data-title")+" ("+e.display[g?"valid":"invalid"]+")")},f.checkDecimal=function(){f.decimal&&/\./g.test(f.preview.value)||!f.decimal&&/\,/g.test(f.preview.value)?f.$decBtn.attr({disabled:"disabled","aria-disabled":"true"}).removeClass(e.css.buttonHover).addClass(e.css.buttonDisabled):f.$decBtn.removeAttr("disabled").attr({"aria-disabled":"false"}).addClass(e.css.buttonDefault).removeClass(e.css.buttonDisabled)},f.getLayers=function(c){var d=b.css,e=c.attr("data-pos"),f=c.closest("."+d.keyboard).find('button[data-pos="'+e+'"]');return f.filter(function(){return""!==a(this).find("."+d.keyText).text()}).add(c)},f.switchInput=function(b,c){if(a.isFunction(e.switchInput))e.switchInput(f,b,c);else{f.$keyboard.length&&f.$keyboard.hide();var d,g=!1,h=a("button, input, textarea, a").filter(":visible").not(":disabled"),i=h.index(f.$el)+(b?1:-1);if(f.$keyboard.length&&f.$keyboard.show(),i>h.length-1&&(g=e.stopAtEnd,i=0),0>i&&(g=e.stopAtEnd,i=h.length-1),!g){if(c=f.close(c),!c)return;d=h.eq(i).data("keyboard"),d&&d.options.openOn.length?d.focusOn():h.eq(i).focus()}}return!1},f.close=function(c){if(f.isOpen&&f.$keyboard.length){clearTimeout(f.throttled);var d=b.css,g=b.events,h=c?f.checkCombos():f.originalContent;if(c&&a.isFunction(e.validate)&&!e.validate(f,h,!0)&&(h=f.originalContent,c=!1,e.cancelClose))return;f.isCurrent(!1),f.isOpen=e.alwaysOpen||e.userClosed,f.$preview.val(h),f.$el.removeClass(d.isCurrent+" "+d.inputAutoAccepted).addClass(c?c===!0?"":d.inputAutoAccepted:"").val(h).trigger(g.inputChange).trigger(e.alwaysOpen?"":g.kbBeforeClose,[f,f.el,c||!1]).trigger(c?g.inputAccepted:g.inputCanceled,[f,f.el]).trigger(e.alwaysOpen?g.kbInactive:g.kbHidden,[f,f.el]).blur(),b.caret(f.$preview,f.last),f&&(f.last.eventTime=(new Date).getTime(),e.alwaysOpen||e.userClosed&&"true"===c||!f.$keyboard.length||(f.removeKeyboard(),f.timer=setTimeout(function(){f&&f.bindFocus()},500)),f.watermark||""!==f.el.value||""===f.inPlaceholder||f.$el.addClass(d.placeholder).val(f.inPlaceholder))}return!!c},f.accept=function(){return f.close(!0)},f.checkClose=function(b){if(!f.opening){f.escClose(b);var c=a.keyboard.css,d=a(b.target);if(d.hasClass(c.input)){var e=d.data("keyboard");e!==f||e.$el.hasClass(c.isCurrent)||b.type!==e.options.openOn||e.focusOn()}}},f.escClose=function(c){if(c&&"keyup"===c.type)return c.which!==b.keyCodes.escape||e.ignoreEsc?"":f.close(e.autoAccept&&e.autoAcceptOnEsc?"true":!1);if(f.isOpen&&(!f.isCurrent()&&f.isOpen||f.isOpen&&c.target!==f.el)){if((e.stayOpen||e.userClosed)&&!a(c.target).hasClass(b.css.input))return;b.allie&&c.preventDefault(),f.close(e.autoAccept?"true":!1)}},f.keyBtn=a("<button />").attr({role:"button",type:"button","aria-disabled":"false",tabindex:"-1"}).addClass(b.css.keyButton),f.processName=function(a){var b,c,d=(a||"").replace(/[^a-z0-9-_]/gi,""),e=d.length,f=[];if(e>1&&a===d)return a;if(e=a.length){for(b=0;e>b;b++)c=a[b],f.push(/[a-z0-9-_]/i.test(c)?/[-_]/.test(c)&&0!==b?"":c:(0===b?"":"-")+c.charCodeAt(0));return f.join("")}return a},f.processKeys=function(b){var c,d=b.split(":"),e={name:null,map:"",title:""};return/\(.+\)/.test(d[0])||/^:\(.+\)/.test(b)||/\([(:)]\)/.test(b)?/\([(:)]\)/.test(b)?(c=d[0].match(/([^(]+)\((.+)\)/),c&&c.length?(e.name=c[1],e.map=c[2],e.title=d.length>1?d.slice(1).join(":"):""):(e.name=b.match(/([^(]+)/)[0],":"===e.name&&(d=d.slice(1)),null===c&&(e.map=":",d=d.slice(2)),e.title=d.length?d.join(":"):"")):(e.map=b.match(/\(([^()]+?)\)/)[1],b=b.replace(/\(([^()]+)\)/,""),c=b.split(":"),""===c[0]?(e.name=":",d=d.slice(1)):e.name=c[0],e.title=d.length>1?d.slice(1).join(":"):""):(""===d[0]?(e.name=":",d=d.slice(1)):e.name=d[0],e.title=d.length>1?d.slice(1).join(":"):""),e.title=a.trim(e.title).replace(/_/g," "),e},f.addKey=function(a,c,d){var g,h,i,j={},k=f.processKeys(d?a:c),l=b.css;return!d&&e.display[k.name]?(i=f.processKeys(e.display[k.name]),i.action=f.processKeys(a).name):(i=k,i.action=k.name),j.name=f.processName(k.name),""!==i.map?(b.builtLayouts[f.layout].mappedKeys[i.map]=i.name,b.builtLayouts[f.layout].acceptedKeys.push(i.name)):d&&b.builtLayouts[f.layout].acceptedKeys.push(i.name),g=d?""===j.name?"":l.keyPrefix+j.name:l.keyAction+" "+l.keyPrefix+i.action,g+=(i.name.length>2?" "+l.keyWide:"")+" "+e.css.buttonDefault,j.html='<span class="'+l.keyText+'">'+i.name.replace(/[\u00A0-\u9999]/gim,function(a){return"&#"+a.charCodeAt(0)+";"})+"</span>",j.$key=f.keyBtn.clone().attr({"data-value":d?i.name:i.action,"data-name":i.action,"data-pos":f.temp[1]+","+f.temp[2],"data-action":i.action,"data-html":j.html}).addClass(g).html(j.html).appendTo(f.temp[0]),i.map&&j.$key.attr("data-mapped",i.map),(i.title||k.title)&&j.$key.attr({"data-title":k.title||i.title,title:k.title||i.title}),"function"==typeof e.buildKey&&(j=e.buildKey(f,j),h=j.$key.html(),j.$key.attr("data-html",h)),j.$key},f.customHash=function(a){var b,c,d,f,g,h=[],i=[];a="undefined"==typeof a?e.customLayout:a;for(c in a)a.hasOwnProperty(c)&&h.push(a[c]);if(i=i.concat.apply(i,h).join(" "),d=0,g=i.length,0===g)return d;for(b=0;g>b;b++)f=i.charCodeAt(b),d=(d<<5)-d+f,d&=d;return d},f.buildKeyboard=function(c,d){a.isEmptyObject(e.display)&&f.updateLanguage();var g,h,i,j=b.css,k=0,l=b.builtLayouts[c||f.layout||e.layout]={mappedKeys:{},acceptedKeys:[]},m=l.acceptedKeys=e.restrictInclude?(""+e.restrictInclude).split(/\s+/)||[]:[],n=j.keyboard+" "+e.css.popup+" "+e.css.container+(e.alwaysOpen||e.userClosed?" "+j.alwaysOpen:""),o=a("<div />").addClass(n).attr({role:"textbox"}).hide();return d&&"custom"===e.layout||!b.layouts.hasOwnProperty(e.layout)?(e.layout="custom",n=b.layouts.custom=e.customLayout||{normal:["{cancel}"]}):n=b.layouts[d?e.layout:c||f.layout||e.layout],a.each(n,function(b,c){if(""!==b&&!/^(name|lang|rtl)$/i.test(b))for("default"===b&&(b="normal"),k++,h=a("<div />").attr("name",b).addClass(j.keySet+" "+j.keySet+"-"+b).appendTo(o).toggle("normal"===b),g=0;g<c.length;g++)i=a.trim(c[g]).replace(/\{(\.?)[\s+]?:[\s+]?(\.?)\}/g,"{$1:$2}"),f.buildRow(h,g,i.split(/\s+/),m),h.find("."+j.keyButton+",."+j.keySpacer).filter(":last").after('<br class="'+j.endRow+'"/>')}),k>1&&(f.sets=!0),l.hasMappedKeys=!a.isEmptyObject(l.mappedKeys),l.$keyboard=o,o},f.buildRow=function(c,d,g,h){var i,j,k,l,m,n,o=b.css;for(k=0;k<g.length;k++)if(f.temp=[c,d,k],l=!1,0!==g[k].length)if(/^\{\S+\}$/.test(g[k])){if(m=g[k].match(/^\{(\S+)\}$/)[1],/\!\!/.test(m)&&(m=m.replace("!!",""),l=!0),/^sp:((\d+)?([\.|,]\d+)?)(em|px)?$/i.test(m)&&(n=parseFloat(m.replace(/,/,".").match(/^sp:((\d+)?([\.|,]\d+)?)(em|px)?$/i)[1]||0),a('<span class="'+o.keyText+'"></span>').width(m.match(/px/i)?n+"px":2*n+"em").addClass(o.keySpacer).appendTo(c)),/^empty(:((\d+)?([\.|,]\d+)?)(em|px)?)?$/i.test(m)&&(n=/:/.test(m)?parseFloat(m.replace(/,/,".").match(/^empty:((\d+)?([\.|,]\d+)?)(em|px)?$/i)[1]||0):"",f.addKey(""," ").addClass(e.css.buttonDisabled+" "+e.css.buttonEmpty).attr("aria-disabled",!0).width(n?m.match("px")?n+"px":2*n+"em":"")),/^meta\d+\:?(\w+)?/i.test(m)){f.addKey(m.split(":")[0],m).addClass(o.keyHasActive);continue}switch(j=m.split(":"),j[0].toLowerCase()){case"a":case"accept":f.addKey("accept",m).addClass(e.css.buttonAction+" "+o.keyAction);break;case"alt":case"altgr":f.addKey("alt",m).addClass(o.keyHasActive);break;case"b":case"bksp":f.addKey("bksp",m);break;case"c":case"cancel":f.addKey("cancel",m).addClass(e.css.buttonAction+" "+o.keyAction);break;case"combo":f.addKey("combo",m).addClass(o.keyHasActive).attr("title",function(a,b){return b+" "+e.display[e.useCombos?"active":"disabled"]}).toggleClass(e.css.buttonActive,e.useCombos);break;case"dec":h.push(f.decimal?".":","),f.addKey("dec",m);break;case"e":case"enter":f.addKey("enter",m).addClass(e.css.buttonAction+" "+o.keyAction);break;case"lock":f.addKey("lock",m).addClass(o.keyHasActive);break;case"s":case"shift":f.addKey("shift",m).addClass(o.keyHasActive);break;case"sign":h.push("-"),f.addKey("sign",m);break;case"space":h.push(" "),f.addKey("space",m);break;case"t":case"tab":f.addKey("tab",m);break;default:b.keyaction.hasOwnProperty(j[0])&&f.addKey(j[0],m).toggleClass(e.css.buttonAction+" "+o.keyAction,l)}}else i=g[k],f.addKey(i,i,!0)},f.removeBindings=function(b){a(document).unbind(b),f.el.ownerDocument!==document&&a(f.el.ownerDocument).unbind(b),a(window).unbind(b),f.$el.unbind(b)},f.removeKeyboard=function(){f.$allKeys=null,f.$decBtn=null,e.usePreview&&f.$preview.removeData("keyboard"),f.preview=null,f.$preview=null,f.$previewCopy=null,f.$keyboard.removeData("keyboard"),f.$keyboard.remove(),f.$keyboard=[],f.isOpen=!1,f.isCurrent(!1)},f.destroy=function(a){var c,d=b.css,g=f.extensionNamespace.length,h=[d.input,d.locked,d.placeholder,d.noKeyboard,d.alwaysOpen,e.css.input,d.isCurrent].join(" ");for(clearTimeout(f.timer),clearTimeout(f.timer2),f.$keyboard.length&&f.removeKeyboard(),f.removeBindings(f.namespace),f.removeBindings(f.namespace+"callbacks"),c=0;g>c;c++)f.removeBindings(f.extensionNamespace[c]);f.el.active=!1,f.$el.removeClass(h).removeAttr("aria-haspopup").removeAttr("role").removeData("keyboard"),f=null,"function"==typeof a&&a()},f.init()};return b.keyCodes={backSpace:8,tab:9,enter:13,capsLock:20,escape:27,space:32,pageUp:33,pageDown:34,end:35,home:36,left:37,up:38,right:39,down:40,insert:45,"delete":46,A:65,Z:90,V:86,C:67,X:88,a:97,z:122},b.css={idSuffix:"_keyboard",input:"ui-keyboard-input",inputClone:"ui-keyboard-preview-clone",wrapper:"ui-keyboard-preview-wrapper",preview:"ui-keyboard-preview",keyboard:"ui-keyboard",keySet:"ui-keyboard-keyset",keyButton:"ui-keyboard-button",keyWide:"ui-keyboard-widekey",keyPrefix:"ui-keyboard-",keyText:"ui-keyboard-text",keyHasActive:"ui-keyboard-hasactivestate",keyAction:"ui-keyboard-actionkey",keySpacer:"ui-keyboard-spacer",keyToggle:"ui-keyboard-toggle",keyDisabled:"ui-keyboard-disabled",locked:"ui-keyboard-lockedinput",alwaysOpen:"ui-keyboard-always-open",noKeyboard:"ui-keyboard-nokeyboard",placeholder:"ui-keyboard-placeholder",hasFocus:"ui-keyboard-has-focus",isCurrent:"ui-keyboard-input-current",inputValid:"ui-keyboard-valid-input",inputInvalid:"ui-keyboard-invalid-input",inputAutoAccepted:"ui-keyboard-autoaccepted",endRow:"ui-keyboard-button-endrow"},b.events={kbChange:"keyboardChange",kbBeforeClose:"beforeClose",kbBeforeVisible:"beforeVisible",kbVisible:"visible",kbInit:"initialized",kbInactive:"inactive",kbHidden:"hidden",kbRepeater:"repeater",kbKeysetChange:"keysetChange",inputAccepted:"accepted",inputCanceled:"canceled",inputChange:"change",inputRestricted:"restricted"},b.keyaction={accept:function(a){return a.close(!0),!1},alt:function(a){a.altActive=!a.altActive,a.showSet()},bksp:function(a){a.insertText("\b")},cancel:function(a){return a.close(),!1},clear:function(a){a.$preview.val(""),a.$decBtn.length&&a.checkDecimal()},combo:function(a){var c=a.options,d=!c.useCombos,e=a.$keyboard.find("."+b.css.keyPrefix+"combo");return c.useCombos=d,e.toggleClass(c.css.buttonActive,d).attr("title",e.attr("data-title")+" ("+c.display[d?"active":"disabled"]+")"),d&&a.checkCombos(),!1},dec:function(a){a.insertText(a.decimal?".":",")},del:function(a){a.insertText("{d}")},"default":function(a){a.shiftActive=a.altActive=a.metaActive=!1,a.showSet()},enter:function(c,d,e){var f=c.el.nodeName,g=c.options;return e.shiftKey?g.enterNavigation?c.switchInput(!e[g.enterMod],!0):c.close(!0):g.enterNavigation&&("TEXTAREA"!==f||e[g.enterMod])?c.switchInput(!e[g.enterMod],g.autoAccept?"true":!1):void("TEXTAREA"===f&&a(e.target).closest("button").length&&c.insertText((b.msie?" ":"")+"\n"))},lock:function(a){a.last.keyset[0]=a.shiftActive=a.capsLock=!a.capsLock,a.showSet()},left:function(a){var c=b.caret(a.$preview);c.start-1>=0&&(a.last.start=a.last.end=c.start-1,b.caret(a.$preview,a.last),a.setScroll())},meta:function(b,c){var d=a(c);b.metaActive=!d.hasClass(b.options.css.buttonActive),b.showSet(d.attr("data-name"))},next:function(a){return a.switchInput(!0,a.options.autoAccept),!1},normal:function(a){a.shiftActive=a.altActive=a.metaActive=!1,a.showSet()},prev:function(a){return a.switchInput(!1,a.options.autoAccept),!1},right:function(a){var c=b.caret(a.$preview);c.start+1<=a.$preview.val().length&&(a.last.start=a.last.end=c.start+1,b.caret(a.$preview,a.last),a.setScroll())},shift:function(a){a.last.keyset[0]=a.shiftActive=!a.shiftActive,a.showSet()},sign:function(a){/^\-?\d*\.?\d*$/.test(a.$preview.val())&&a.$preview.val(-1*a.$preview.val())},space:function(a){a.insertText(" ")},tab:function(a){var b=a.el.nodeName,c=a.options;return"INPUT"===b?c.tabNavigation?a.switchInput(!a.shiftActive,!0):!1:void a.insertText("	")},toggle:function(a){a.enabled=!a.enabled,
a.toggle()},NBSP:" ",ZWSP:"​",ZWNJ:"‌",ZWJ:"‍",LRM:"‎",RLM:"‏"},b.builtLayouts={},b.layouts={alpha:{normal:["` 1 2 3 4 5 6 7 8 9 0 - = {bksp}","{tab} a b c d e f g h i j [ ] \\","k l m n o p q r s ; ' {enter}","{shift} t u v w x y z , . / {shift}","{accept} {space} {cancel}"],shift:["~ ! @ # $ % ^ & * ( ) _ + {bksp}","{tab} A B C D E F G H I J { } |",'K L M N O P Q R S : " {enter}',"{shift} T U V W X Y Z < > ? {shift}","{accept} {space} {cancel}"]},qwerty:{normal:["` 1 2 3 4 5 6 7 8 9 0 - = {bksp}","{tab} q w e r t y u i o p [ ] \\","a s d f g h j k l ; ' {enter}","{shift} z x c v b n m , . / {shift}","{accept} {space} {cancel}"],shift:["~ ! @ # $ % ^ & * ( ) _ + {bksp}","{tab} Q W E R T Y U I O P { } |",'A S D F G H J K L : " {enter}',"{shift} Z X C V B N M < > ? {shift}","{accept} {space} {cancel}"]},international:{normal:["` 1 2 3 4 5 6 7 8 9 0 - = {bksp}","{tab} q w e r t y u i o p [ ] \\","a s d f g h j k l ; ' {enter}","{shift} z x c v b n m , . / {shift}","{accept} {alt} {space} {alt} {cancel}"],shift:["~ ! @ # $ % ^ & * ( ) _ + {bksp}","{tab} Q W E R T Y U I O P { } |",'A S D F G H J K L : " {enter}',"{shift} Z X C V B N M < > ? {shift}","{accept} {alt} {space} {alt} {cancel}"],alt:["~ ¡ ² ³ ¤ € ¼ ½ ¾ ‘ ’ ¥ × {bksp}","{tab} ä å é ® þ ü ú í ó ö « » ¬","á ß ð f g h j k ø ¶ ´ {enter}","{shift} æ x © v b ñ µ ç > ¿ {shift}","{accept} {alt} {space} {alt} {cancel}"],"alt-shift":["~ ¹ ² ³ £ € ¼ ½ ¾ ‘ ’ ¥ ÷ {bksp}","{tab} Ä Å É ® Þ Ü Ú Í Ó Ö « » ¦","Ä § Ð F G H J K Ø ° ¨ {enter}","{shift} Æ X ¢ V B Ñ µ Ç . ¿ {shift}","{accept} {alt} {space} {alt} {cancel}"]},colemak:{normal:["` 1 2 3 4 5 6 7 8 9 0 - = {bksp}","{tab} q w f p g j l u y ; [ ] \\","{bksp} a r s t d h n e i o ' {enter}","{shift} z x c v b k m , . / {shift}","{accept} {space} {cancel}"],shift:["~ ! @ # $ % ^ & * ( ) _ + {bksp}","{tab} Q W F P G J L U Y : { } |",'{bksp} A R S T D H N E I O " {enter}',"{shift} Z X C V B K M < > ? {shift}","{accept} {space} {cancel}"]},dvorak:{normal:["` 1 2 3 4 5 6 7 8 9 0 [ ] {bksp}","{tab} ' , . p y f g c r l / = \\","a o e u i d h t n s - {enter}","{shift} ; q j k x b m w v z {shift}","{accept} {space} {cancel}"],shift:["~ ! @ # $ % ^ & * ( ) { } {bksp}",'{tab} " < > P Y F G C R L ? + |',"A O E U I D H T N S _ {enter}","{shift} : Q J K X B M W V Z {shift}","{accept} {space} {cancel}"]},num:{normal:["= ( ) {b}","{clear} / * -","7 8 9 +","4 5 6 {sign}","1 2 3 %","0 {dec} {a} {c}"]}},b.language={en:{display:{a:"✔:Accept (Shift+Enter)",accept:"Accept:Accept (Shift+Enter)",alt:"Alt:⌥ AltGr",b:"⌫:Backspace",bksp:"Bksp:Backspace",c:"✖:Cancel (Esc)",cancel:"Cancel:Cancel (Esc)",clear:"C:Clear",combo:"ö:Toggle Combo Keys",dec:".:Decimal",e:"⏎:Enter",empty:" ",enter:"Enter:Enter ⏎",left:"←",lock:"Lock:⇪ Caps Lock",next:"Next ⇨",prev:"⇦ Prev",right:"→",s:"⇧:Shift",shift:"Shift:Shift",sign:"±:Change Sign",space:" :Space",t:"⇥:Tab",tab:"⇥ Tab:Tab",toggle:" ",valid:"valid",invalid:"invalid",active:"active",disabled:"disabled"},wheelMessage:"Use mousewheel to see other keys",comboRegex:/([`\'~\^\"ao])([a-z])/gim,combos:{"`":{a:"à",A:"À",e:"è",E:"È",i:"ì",I:"Ì",o:"ò",O:"Ò",u:"ù",U:"Ù",y:"ỳ",Y:"Ỳ"},"'":{a:"á",A:"Á",e:"é",E:"É",i:"í",I:"Í",o:"ó",O:"Ó",u:"ú",U:"Ú",y:"ý",Y:"Ý"},'"':{a:"ä",A:"Ä",e:"ë",E:"Ë",i:"ï",I:"Ï",o:"ö",O:"Ö",u:"ü",U:"Ü",y:"ÿ",Y:"Ÿ"},"^":{a:"â",A:"Â",e:"ê",E:"Ê",i:"î",I:"Î",o:"ô",O:"Ô",u:"û",U:"Û",y:"ŷ",Y:"Ŷ"},"~":{a:"ã",A:"Ã",e:"ẽ",E:"Ẽ",i:"ĩ",I:"Ĩ",o:"õ",O:"Õ",u:"ũ",U:"Ũ",y:"ỹ",Y:"Ỹ",n:"ñ",N:"Ñ"}}}},b.defaultOptions={language:null,rtl:!1,layout:"qwerty",customLayout:null,position:{of:null,my:"center top",at:"center top",at2:"center bottom"},reposition:!0,usePreview:!0,alwaysOpen:!1,initialFocus:!0,noFocus:!1,stayOpen:!1,ignoreEsc:!1,css:{input:"ui-widget-content ui-corner-all",container:"ui-widget-content ui-widget ui-corner-all ui-helper-clearfix",popup:"",buttonDefault:"ui-state-default ui-corner-all",buttonHover:"ui-state-hover",buttonAction:"ui-state-active",buttonActive:"ui-state-active",buttonDisabled:"ui-state-disabled",buttonEmpty:"ui-keyboard-empty"},autoAccept:!1,autoAcceptOnEsc:!1,lockInput:!1,restrictInput:!1,restrictInclude:"",acceptValid:!1,cancelClose:!0,tabNavigation:!1,enterNavigation:!1,enterMod:"altKey",stopAtEnd:!0,appendLocally:!1,appendTo:"body",stickyShift:!0,preventPaste:!1,caretToEnd:!1,scrollAdjustment:10,maxLength:!1,maxInsert:!0,repeatDelay:500,repeatRate:20,resetDefault:!0,openOn:"focus",keyBinding:"mousedown touchstart",useWheel:!0,useCombos:!0,validate:function(a,b,c){return!0}},b.comboRegex=/([`\'~\^\"ao])([a-z])/gim,b.currentKeyboard="",a('<!--[if lte IE 8]><script>jQuery("body").addClass("oldie");</script><![endif]--><!--[if IE]><script>jQuery("body").addClass("ie");</script><![endif]-->').appendTo("body").remove(),b.msie=a("body").hasClass("oldie"),b.allie=a("body").hasClass("ie"),b.watermark="undefined"!=typeof document.createElement("input").placeholder,b.checkCaretSupport=function(){if("boolean"!=typeof b.checkCaret){var c=a('<div style="height:0px;width:0px;overflow:hidden;position:fixed;top:0;left:-100px;"><input type="text" value="testing"/></div>').prependTo("body");b.caret(c.find("input"),3,3),b.checkCaret=3!==b.caret(c.find("input").hide().show()).start,c.remove()}return b.checkCaret},b.caret=function(a,b,c){if(!a||!a.length||a.is(":hidden")||"hidden"===a.css("visibility"))return{};var d,e,f,g,h=a.data("keyboard"),i=h&&h.options.noFocus;return i||a.focus(),"undefined"!=typeof b?("object"==typeof b&&"start"in b&&"end"in b?(d=b.start,e=b.end):"undefined"==typeof c&&(c=b),"number"==typeof b&&"number"==typeof c?(d=b,e=c):"start"===b?d=e=0:"string"==typeof b&&(d=e=a.val().length),a.caret(d,e,i)):(g=a.caret(),d=g.start,e=g.end,f=a[0].value||a.text()||"",{start:d,end:e,text:f.substring(d,e),replaceStr:function(a){return f.substring(0,d)+a+f.substring(e,f.length)}})},a.fn.keyboard=function(b){return this.each(function(){a(this).data("keyboard")||new a.keyboard(this,b)})},a.fn.getkeyboard=function(){return this.data("keyboard")},a.fn.caret=function(a,b,c){if("undefined"==typeof this[0]||this.is(":hidden")||"hidden"===this.css("visibility"))return this;var d,e,f,g,h,i=document.selection,j=this,k=j[0],l=k.scrollTop,m=!1,n=!0;try{m="selectionStart"in k}catch(o){n=!1}return n&&"undefined"!=typeof a?(/(email|number)/i.test(k.type)||(m?(k.selectionStart=a,k.selectionEnd=b):(d=k.createTextRange(),d.collapse(!0),d.moveStart("character",a),d.moveEnd("character",b-a),d.select())),c||!j.is(":visible")&&"hidden"===j.css("visibility")||k.focus(),k.scrollTop=l,this):(/(email|number)/i.test(k.type)?a=b=j.val().length:m?(a=k.selectionStart,b=k.selectionEnd):i?"TEXTAREA"===k.nodeName?(h=j.val(),e=i.createRange(),f=e.duplicate(),f.moveToElementText(k),f.setEndPoint("EndToEnd",e),a=f.text.replace(/\r/g,"\n").length,b=a+e.text.replace(/\r/g,"\n").length):(h=j.val().replace(/\r/g,"\n"),e=i.createRange().duplicate(),e.moveEnd("character",h.length),a=""===e.text?h.length:h.lastIndexOf(e.text),e=i.createRange().duplicate(),e.moveStart("character",-h.length),b=e.text.length):a=b=(k.value||"").length,g=k.value||"",{start:a,end:b,text:g.substring(a,b),replace:function(c){return g.substring(0,a)+c+g.substring(b,g.length)}})},b});
/*
 jquery.fullscreen 1.1.4
 https://github.com/kayahr/jquery-fullscreen-plugin
 Copyright (C) 2012 Klaus Reimer <k@ailis.de>
 Licensed under the MIT license
 (See http://www.opensource.org/licenses/mit-license)
*/
function d(b){var c,a;if(!this.length)return this;c=this[0];c.ownerDocument?a=c.ownerDocument:(a=c,c=a.documentElement);if(null==b){if(!a.cancelFullScreen&&!a.webkitCancelFullScreen&&!a.mozCancelFullScreen)return null;b=!!a.fullScreen||!!a.webkitIsFullScreen||!!a.mozFullScreen;return!b?b:a.fullScreenElement||a.webkitCurrentFullScreenElement||a.mozFullScreenElement||b}b?(b=c.requestFullScreen||c.webkitRequestFullScreen||c.mozRequestFullScreen)&&b.call(c,Element.ALLOW_KEYBOARD_INPUT):(b=a.cancelFullScreen||
a.webkitCancelFullScreen||a.mozCancelFullScreen)&&b.call(a);return this}jQuery.fn.fullScreen=d;jQuery.fn.toggleFullScreen=function(){return d.call(this,!d.call(this))};var e,f,g;e=document;e.webkitCancelFullScreen?(f="webkitfullscreenchange",g="webkitfullscreenerror"):e.mozCancelFullScreen?(f="mozfullscreenchange",g="mozfullscreenerror"):(f="fullscreenchange",g="fullscreenerror");jQuery(document).bind(f,function(){jQuery(document).trigger(new jQuery.Event("fullscreenchange"))});
jQuery(document).bind(g,function(){jQuery(document).trigger(new jQuery.Event("fullscreenerror"))});
!function(t,i,s){function e(t,s){this.wrapper="string"==typeof t?i.querySelector(t):t,this.scroller=this.wrapper.children[0],this.scrollerStyle=this.scroller.style,this.options={resizeScrollbars:!0,mouseWheelSpeed:20,snapThreshold:.334,startX:0,startY:0,scrollY:!0,directionLockThreshold:5,momentum:!0,bounce:!0,bounceTime:600,bounceEasing:"",preventDefault:!0,preventDefaultException:{tagName:/^(INPUT|TEXTAREA|BUTTON|SELECT)$/},HWCompositing:!0,useTransition:!0,useTransform:!0};for(var e in s)this.options[e]=s[e];this.translateZ=this.options.HWCompositing&&h.hasPerspective?" translateZ(0)":"",this.options.useTransition=h.hasTransition&&this.options.useTransition,this.options.useTransform=h.hasTransform&&this.options.useTransform,this.options.eventPassthrough=this.options.eventPassthrough===!0?"vertical":this.options.eventPassthrough,this.options.preventDefault=!this.options.eventPassthrough&&this.options.preventDefault,this.options.scrollY="vertical"==this.options.eventPassthrough?!1:this.options.scrollY,this.options.scrollX="horizontal"==this.options.eventPassthrough?!1:this.options.scrollX,this.options.freeScroll=this.options.freeScroll&&!this.options.eventPassthrough,this.options.directionLockThreshold=this.options.eventPassthrough?0:this.options.directionLockThreshold,this.options.bounceEasing="string"==typeof this.options.bounceEasing?h.ease[this.options.bounceEasing]||h.ease.circular:this.options.bounceEasing,this.options.resizePolling=void 0===this.options.resizePolling?60:this.options.resizePolling,this.options.tap===!0&&(this.options.tap="tap"),"scale"==this.options.shrinkScrollbars&&(this.options.useTransition=!1),this.options.invertWheelDirection=this.options.invertWheelDirection?-1:1,this.x=0,this.y=0,this.directionX=0,this.directionY=0,this._events={},this._init(),this.refresh(),this.scrollTo(this.options.startX,this.options.startY),this.enable()}function o(t,s,e){var o=i.createElement("div"),n=i.createElement("div");return e===!0&&(o.style.cssText="position:absolute;z-index:9999",n.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;position:absolute;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.9);border-radius:3px"),n.className="iScrollIndicator","h"==t?(e===!0&&(o.style.cssText+=";height:7px;left:2px;right:2px;bottom:0",n.style.height="100%"),o.className="iScrollHorizontalScrollbar"):(e===!0&&(o.style.cssText+=";width:7px;bottom:2px;top:2px;right:1px",n.style.width="100%"),o.className="iScrollVerticalScrollbar"),o.style.cssText+=";overflow:hidden",s||(o.style.pointerEvents="none"),o.appendChild(n),o}function n(s,e){this.wrapper="string"==typeof e.el?i.querySelector(e.el):e.el,this.wrapperStyle=this.wrapper.style,this.indicator=this.wrapper.children[0],this.indicatorStyle=this.indicator.style,this.scroller=s,this.options={listenX:!0,listenY:!0,interactive:!1,resize:!0,defaultScrollbars:!1,shrink:!1,fade:!1,speedRatioX:0,speedRatioY:0};for(var o in e)this.options[o]=e[o];this.sizeRatioX=1,this.sizeRatioY=1,this.maxPosX=0,this.maxPosY=0,this.options.interactive&&(this.options.disableTouch||(h.addEvent(this.indicator,"touchstart",this),h.addEvent(t,"touchend",this)),this.options.disablePointer||(h.addEvent(this.indicator,h.prefixPointerEvent("pointerdown"),this),h.addEvent(t,h.prefixPointerEvent("pointerup"),this)),this.options.disableMouse||(h.addEvent(this.indicator,"mousedown",this),h.addEvent(t,"mouseup",this))),this.options.fade&&(this.wrapperStyle[h.style.transform]=this.scroller.translateZ,this.wrapperStyle[h.style.transitionDuration]=h.isBadAndroid?"0.001s":"0ms",this.wrapperStyle.opacity="0")}var r=t.requestAnimationFrame||t.webkitRequestAnimationFrame||t.mozRequestAnimationFrame||t.oRequestAnimationFrame||t.msRequestAnimationFrame||function(i){t.setTimeout(i,1e3/60)},h=function(){function e(t){return r===!1?!1:""===r?t:r+t.charAt(0).toUpperCase()+t.substr(1)}var o={},n=i.createElement("div").style,r=function(){for(var t,i=["t","webkitT","MozT","msT","OT"],s=0,e=i.length;e>s;s++)if(t=i[s]+"ransform",t in n)return i[s].substr(0,i[s].length-1);return!1}();o.getTime=Date.now||function(){return(new Date).getTime()},o.extend=function(t,i){for(var s in i)t[s]=i[s]},o.addEvent=function(t,i,s,e){t.addEventListener(i,s,!!e)},o.removeEvent=function(t,i,s,e){t.removeEventListener(i,s,!!e)},o.prefixPointerEvent=function(i){return t.MSPointerEvent?"MSPointer"+i.charAt(9).toUpperCase()+i.substr(10):i},o.momentum=function(t,i,e,o,n,r){var h,a,l=t-i,c=s.abs(l)/e;return r=void 0===r?6e-4:r,h=t+c*c/(2*r)*(0>l?-1:1),a=c/r,o>h?(h=n?o-n/2.5*(c/8):o,l=s.abs(h-t),a=l/c):h>0&&(h=n?n/2.5*(c/8):0,l=s.abs(t)+h,a=l/c),{destination:s.round(h),duration:a}};var h=e("transform");return o.extend(o,{hasTransform:h!==!1,hasPerspective:e("perspective")in n,hasTouch:"ontouchstart"in t,hasPointer:t.PointerEvent||t.MSPointerEvent,hasTransition:e("transition")in n}),o.isBadAndroid=/Android /.test(t.navigator.appVersion)&&!/Chrome\/\d/.test(t.navigator.appVersion),o.extend(o.style={},{transform:h,transitionTimingFunction:e("transitionTimingFunction"),transitionDuration:e("transitionDuration"),transitionDelay:e("transitionDelay"),transformOrigin:e("transformOrigin")}),o.hasClass=function(t,i){var s=new RegExp("(^|\\s)"+i+"(\\s|$)");return s.test(t.className)},o.addClass=function(t,i){if(!o.hasClass(t,i)){var s=t.className.split(" ");s.push(i),t.className=s.join(" ")}},o.removeClass=function(t,i){if(o.hasClass(t,i)){var s=new RegExp("(^|\\s)"+i+"(\\s|$)","g");t.className=t.className.replace(s," ")}},o.offset=function(t){for(var i=-t.offsetLeft,s=-t.offsetTop;t=t.offsetParent;)i-=t.offsetLeft,s-=t.offsetTop;return{left:i,top:s}},o.preventDefaultException=function(t,i){for(var s in i)if(i[s].test(t[s]))return!0;return!1},o.extend(o.eventType={},{touchstart:1,touchmove:1,touchend:1,mousedown:2,mousemove:2,mouseup:2,pointerdown:3,pointermove:3,pointerup:3,MSPointerDown:3,MSPointerMove:3,MSPointerUp:3}),o.extend(o.ease={},{quadratic:{style:"cubic-bezier(0.25, 0.46, 0.45, 0.94)",fn:function(t){return t*(2-t)}},circular:{style:"cubic-bezier(0.1, 0.57, 0.1, 1)",fn:function(t){return s.sqrt(1- --t*t)}},back:{style:"cubic-bezier(0.175, 0.885, 0.32, 1.275)",fn:function(t){var i=4;return(t-=1)*t*((i+1)*t+i)+1}},bounce:{style:"",fn:function(t){return(t/=1)<1/2.75?7.5625*t*t:2/2.75>t?7.5625*(t-=1.5/2.75)*t+.75:2.5/2.75>t?7.5625*(t-=2.25/2.75)*t+.9375:7.5625*(t-=2.625/2.75)*t+.984375}},elastic:{style:"",fn:function(t){var i=.22,e=.4;return 0===t?0:1==t?1:e*s.pow(2,-10*t)*s.sin((t-i/4)*(2*s.PI)/i)+1}}}),o.tap=function(t,s){var e=i.createEvent("Event");e.initEvent(s,!0,!0),e.pageX=t.pageX,e.pageY=t.pageY,t.target.dispatchEvent(e)},o.click=function(t){var s,e=t.target;/(SELECT|INPUT|TEXTAREA)/i.test(e.tagName)||(s=i.createEvent("MouseEvents"),s.initMouseEvent("click",!0,!0,t.view,1,e.screenX,e.screenY,e.clientX,e.clientY,t.ctrlKey,t.altKey,t.shiftKey,t.metaKey,0,null),s._constructed=!0,e.dispatchEvent(s))},o}();e.prototype={version:"5.1.3",_init:function(){this._initEvents(),(this.options.scrollbars||this.options.indicators)&&this._initIndicators(),this.options.mouseWheel&&this._initWheel(),this.options.snap&&this._initSnap(),this.options.keyBindings&&this._initKeys()},destroy:function(){this._initEvents(!0),this._execEvent("destroy")},_transitionEnd:function(t){t.target==this.scroller&&this.isInTransition&&(this._transitionTime(),this.resetPosition(this.options.bounceTime)||(this.isInTransition=!1,this._execEvent("scrollEnd")))},_start:function(t){if((1==h.eventType[t.type]||0===t.button)&&this.enabled&&(!this.initiated||h.eventType[t.type]===this.initiated)){!this.options.preventDefault||h.isBadAndroid||h.preventDefaultException(t.target,this.options.preventDefaultException)||t.preventDefault();var i,e=t.touches?t.touches[0]:t;this.initiated=h.eventType[t.type],this.moved=!1,this.distX=0,this.distY=0,this.directionX=0,this.directionY=0,this.directionLocked=0,this._transitionTime(),this.startTime=h.getTime(),this.options.useTransition&&this.isInTransition?(this.isInTransition=!1,i=this.getComputedPosition(),this._translate(s.round(i.x),s.round(i.y)),this._execEvent("scrollEnd")):!this.options.useTransition&&this.isAnimating&&(this.isAnimating=!1,this._execEvent("scrollEnd")),this.startX=this.x,this.startY=this.y,this.absStartX=this.x,this.absStartY=this.y,this.pointX=e.pageX,this.pointY=e.pageY,this._execEvent("beforeScrollStart")}},_move:function(t){if(this.enabled&&h.eventType[t.type]===this.initiated){this.options.preventDefault&&t.preventDefault();var i,e,o,n,r=t.touches?t.touches[0]:t,a=r.pageX-this.pointX,l=r.pageY-this.pointY,c=h.getTime();if(this.pointX=r.pageX,this.pointY=r.pageY,this.distX+=a,this.distY+=l,o=s.abs(this.distX),n=s.abs(this.distY),!(c-this.endTime>300&&10>o&&10>n)){if(this.directionLocked||this.options.freeScroll||(o>n+this.options.directionLockThreshold?this.directionLocked="h":n>=o+this.options.directionLockThreshold?this.directionLocked="v":this.directionLocked="n"),"h"==this.directionLocked){if("vertical"==this.options.eventPassthrough)t.preventDefault();else if("horizontal"==this.options.eventPassthrough)return void(this.initiated=!1);l=0}else if("v"==this.directionLocked){if("horizontal"==this.options.eventPassthrough)t.preventDefault();else if("vertical"==this.options.eventPassthrough)return void(this.initiated=!1);a=0}a=this.hasHorizontalScroll?a:0,l=this.hasVerticalScroll?l:0,i=this.x+a,e=this.y+l,(i>0||i<this.maxScrollX)&&(i=this.options.bounce?this.x+a/3:i>0?0:this.maxScrollX),(e>0||e<this.maxScrollY)&&(e=this.options.bounce?this.y+l/3:e>0?0:this.maxScrollY),this.directionX=a>0?-1:0>a?1:0,this.directionY=l>0?-1:0>l?1:0,this.moved||this._execEvent("scrollStart"),this.moved=!0,this._translate(i,e),c-this.startTime>300&&(this.startTime=c,this.startX=this.x,this.startY=this.y)}}},_end:function(t){if(this.enabled&&h.eventType[t.type]===this.initiated){this.options.preventDefault&&!h.preventDefaultException(t.target,this.options.preventDefaultException)&&t.preventDefault();var i,e,o=(t.changedTouches?t.changedTouches[0]:t,h.getTime()-this.startTime),n=s.round(this.x),r=s.round(this.y),a=s.abs(n-this.startX),l=s.abs(r-this.startY),c=0,p="";if(this.isInTransition=0,this.initiated=0,this.endTime=h.getTime(),!this.resetPosition(this.options.bounceTime)){if(this.scrollTo(n,r),!this.moved)return this.options.tap&&h.tap(t,this.options.tap),this.options.click&&h.click(t),void this._execEvent("scrollCancel");if(this._events.flick&&200>o&&100>a&&100>l)return void this._execEvent("flick");if(this.options.momentum&&300>o&&(i=this.hasHorizontalScroll?h.momentum(this.x,this.startX,o,this.maxScrollX,this.options.bounce?this.wrapperWidth:0,this.options.deceleration):{destination:n,duration:0},e=this.hasVerticalScroll?h.momentum(this.y,this.startY,o,this.maxScrollY,this.options.bounce?this.wrapperHeight:0,this.options.deceleration):{destination:r,duration:0},n=i.destination,r=e.destination,c=s.max(i.duration,e.duration),this.isInTransition=1),this.options.snap){var d=this._nearestSnap(n,r);this.currentPage=d,c=this.options.snapSpeed||s.max(s.max(s.min(s.abs(n-d.x),1e3),s.min(s.abs(r-d.y),1e3)),300),n=d.x,r=d.y,this.directionX=0,this.directionY=0,p=this.options.bounceEasing}return n!=this.x||r!=this.y?((n>0||n<this.maxScrollX||r>0||r<this.maxScrollY)&&(p=h.ease.quadratic),void this.scrollTo(n,r,c,p)):void this._execEvent("scrollEnd")}}},_resize:function(){var t=this;clearTimeout(this.resizeTimeout),this.resizeTimeout=setTimeout(function(){t.refresh()},this.options.resizePolling)},resetPosition:function(t){var i=this.x,s=this.y;return t=t||0,!this.hasHorizontalScroll||this.x>0?i=0:this.x<this.maxScrollX&&(i=this.maxScrollX),!this.hasVerticalScroll||this.y>0?s=0:this.y<this.maxScrollY&&(s=this.maxScrollY),i==this.x&&s==this.y?!1:(this.scrollTo(i,s,t,this.options.bounceEasing),!0)},disable:function(){this.enabled=!1},enable:function(){this.enabled=!0},refresh:function(){this.wrapper.offsetHeight;this.wrapperWidth=this.wrapper.clientWidth,this.wrapperHeight=this.wrapper.clientHeight,this.scrollerWidth=this.scroller.offsetWidth,this.scrollerHeight=this.scroller.offsetHeight,this.maxScrollX=this.wrapperWidth-this.scrollerWidth,this.maxScrollY=this.wrapperHeight-this.scrollerHeight,this.hasHorizontalScroll=this.options.scrollX&&this.maxScrollX<0,this.hasVerticalScroll=this.options.scrollY&&this.maxScrollY<0,this.hasHorizontalScroll||(this.maxScrollX=0,this.scrollerWidth=this.wrapperWidth),this.hasVerticalScroll||(this.maxScrollY=0,this.scrollerHeight=this.wrapperHeight),this.endTime=0,this.directionX=0,this.directionY=0,this.wrapperOffset=h.offset(this.wrapper),this._execEvent("refresh"),this.resetPosition()},on:function(t,i){this._events[t]||(this._events[t]=[]),this._events[t].push(i)},off:function(t,i){if(this._events[t]){var s=this._events[t].indexOf(i);s>-1&&this._events[t].splice(s,1)}},_execEvent:function(t){if(this._events[t]){var i=0,s=this._events[t].length;if(s)for(;s>i;i++)this._events[t][i].apply(this,[].slice.call(arguments,1))}},scrollBy:function(t,i,s,e){t=this.x+t,i=this.y+i,s=s||0,this.scrollTo(t,i,s,e)},scrollTo:function(t,i,s,e){e=e||h.ease.circular,this.isInTransition=this.options.useTransition&&s>0,!s||this.options.useTransition&&e.style?(this._transitionTimingFunction(e.style),this._transitionTime(s),this._translate(t,i)):this._animate(t,i,s,e.fn)},scrollToElement:function(t,i,e,o,n){if(t=t.nodeType?t:this.scroller.querySelector(t)){var r=h.offset(t);r.left-=this.wrapperOffset.left,r.top-=this.wrapperOffset.top,e===!0&&(e=s.round(t.offsetWidth/2-this.wrapper.offsetWidth/2)),o===!0&&(o=s.round(t.offsetHeight/2-this.wrapper.offsetHeight/2)),r.left-=e||0,r.top-=o||0,r.left=r.left>0?0:r.left<this.maxScrollX?this.maxScrollX:r.left,r.top=r.top>0?0:r.top<this.maxScrollY?this.maxScrollY:r.top,i=void 0===i||null===i||"auto"===i?s.max(s.abs(this.x-r.left),s.abs(this.y-r.top)):i,this.scrollTo(r.left,r.top,i,n)}},_transitionTime:function(t){if(t=t||0,this.scrollerStyle[h.style.transitionDuration]=t+"ms",!t&&h.isBadAndroid&&(this.scrollerStyle[h.style.transitionDuration]="0.001s"),this.indicators)for(var i=this.indicators.length;i--;)this.indicators[i].transitionTime(t)},_transitionTimingFunction:function(t){if(this.scrollerStyle[h.style.transitionTimingFunction]=t,this.indicators)for(var i=this.indicators.length;i--;)this.indicators[i].transitionTimingFunction(t)},_translate:function(t,i){if(this.options.useTransform?this.scrollerStyle[h.style.transform]="translate("+t+"px,"+i+"px)"+this.translateZ:(t=s.round(t),i=s.round(i),this.scrollerStyle.left=t+"px",this.scrollerStyle.top=i+"px"),this.x=t,this.y=i,this.indicators)for(var e=this.indicators.length;e--;)this.indicators[e].updatePosition()},_initEvents:function(i){var s=i?h.removeEvent:h.addEvent,e=this.options.bindToWrapper?this.wrapper:t;s(t,"orientationchange",this),s(t,"resize",this),this.options.click&&s(this.wrapper,"click",this,!0),this.options.disableMouse||(s(this.wrapper,"mousedown",this),s(e,"mousemove",this),s(e,"mousecancel",this),s(e,"mouseup",this)),h.hasPointer&&!this.options.disablePointer&&(s(this.wrapper,h.prefixPointerEvent("pointerdown"),this),s(e,h.prefixPointerEvent("pointermove"),this),s(e,h.prefixPointerEvent("pointercancel"),this),s(e,h.prefixPointerEvent("pointerup"),this)),h.hasTouch&&!this.options.disableTouch&&(s(this.wrapper,"touchstart",this),s(e,"touchmove",this),s(e,"touchcancel",this),s(e,"touchend",this)),s(this.scroller,"transitionend",this),s(this.scroller,"webkitTransitionEnd",this),s(this.scroller,"oTransitionEnd",this),s(this.scroller,"MSTransitionEnd",this)},getComputedPosition:function(){var i,s,e=t.getComputedStyle(this.scroller,null);return this.options.useTransform?(e=e[h.style.transform].split(")")[0].split(", "),i=+(e[12]||e[4]),s=+(e[13]||e[5])):(i=+e.left.replace(/[^-\d.]/g,""),s=+e.top.replace(/[^-\d.]/g,"")),{x:i,y:s}},_initIndicators:function(){function t(t){for(var i=h.indicators.length;i--;)t.call(h.indicators[i])}var i,s=this.options.interactiveScrollbars,e="string"!=typeof this.options.scrollbars,r=[],h=this;this.indicators=[],this.options.scrollbars&&(this.options.scrollY&&(i={el:o("v",s,this.options.scrollbars),interactive:s,defaultScrollbars:!0,customStyle:e,resize:this.options.resizeScrollbars,shrink:this.options.shrinkScrollbars,fade:this.options.fadeScrollbars,listenX:!1},this.wrapper.appendChild(i.el),r.push(i)),this.options.scrollX&&(i={el:o("h",s,this.options.scrollbars),interactive:s,defaultScrollbars:!0,customStyle:e,resize:this.options.resizeScrollbars,shrink:this.options.shrinkScrollbars,fade:this.options.fadeScrollbars,listenY:!1},this.wrapper.appendChild(i.el),r.push(i))),this.options.indicators&&(r=r.concat(this.options.indicators));for(var a=r.length;a--;)this.indicators.push(new n(this,r[a]));this.options.fadeScrollbars&&(this.on("scrollEnd",function(){t(function(){this.fade()})}),this.on("scrollCancel",function(){t(function(){this.fade()})}),this.on("scrollStart",function(){t(function(){this.fade(1)})}),this.on("beforeScrollStart",function(){t(function(){this.fade(1,!0)})})),this.on("refresh",function(){t(function(){this.refresh()})}),this.on("destroy",function(){t(function(){this.destroy()}),delete this.indicators})},_initWheel:function(){h.addEvent(this.wrapper,"wheel",this),h.addEvent(this.wrapper,"mousewheel",this),h.addEvent(this.wrapper,"DOMMouseScroll",this),this.on("destroy",function(){h.removeEvent(this.wrapper,"wheel",this),h.removeEvent(this.wrapper,"mousewheel",this),h.removeEvent(this.wrapper,"DOMMouseScroll",this)})},_wheel:function(t){if(this.enabled){t.preventDefault(),t.stopPropagation();var i,e,o,n,r=this;if(void 0===this.wheelTimeout&&r._execEvent("scrollStart"),clearTimeout(this.wheelTimeout),this.wheelTimeout=setTimeout(function(){r._execEvent("scrollEnd"),r.wheelTimeout=void 0},400),"deltaX"in t)1===t.deltaMode?(i=-t.deltaX*this.options.mouseWheelSpeed,e=-t.deltaY*this.options.mouseWheelSpeed):(i=-t.deltaX,e=-t.deltaY);else if("wheelDeltaX"in t)i=t.wheelDeltaX/120*this.options.mouseWheelSpeed,e=t.wheelDeltaY/120*this.options.mouseWheelSpeed;else if("wheelDelta"in t)i=e=t.wheelDelta/120*this.options.mouseWheelSpeed;else{if(!("detail"in t))return;i=e=-t.detail/3*this.options.mouseWheelSpeed}if(i*=this.options.invertWheelDirection,e*=this.options.invertWheelDirection,this.hasVerticalScroll||(i=e,e=0),this.options.snap)return o=this.currentPage.pageX,n=this.currentPage.pageY,i>0?o--:0>i&&o++,e>0?n--:0>e&&n++,void this.goToPage(o,n);o=this.x+s.round(this.hasHorizontalScroll?i:0),n=this.y+s.round(this.hasVerticalScroll?e:0),o>0?o=0:o<this.maxScrollX&&(o=this.maxScrollX),n>0?n=0:n<this.maxScrollY&&(n=this.maxScrollY),this.scrollTo(o,n,0)}},_initSnap:function(){this.currentPage={},"string"==typeof this.options.snap&&(this.options.snap=this.scroller.querySelectorAll(this.options.snap)),this.on("refresh",function(){var t,i,e,o,n,r,h=0,a=0,l=0,c=this.options.snapStepX||this.wrapperWidth,p=this.options.snapStepY||this.wrapperHeight;if(this.pages=[],this.wrapperWidth&&this.wrapperHeight&&this.scrollerWidth&&this.scrollerHeight){if(this.options.snap===!0)for(e=s.round(c/2),o=s.round(p/2);l>-this.scrollerWidth;){for(this.pages[h]=[],t=0,n=0;n>-this.scrollerHeight;)this.pages[h][t]={x:s.max(l,this.maxScrollX),y:s.max(n,this.maxScrollY),width:c,height:p,cx:l-e,cy:n-o},n-=p,t++;l-=c,h++}else for(r=this.options.snap,t=r.length,i=-1;t>h;h++)(0===h||r[h].offsetLeft<=r[h-1].offsetLeft)&&(a=0,i++),this.pages[a]||(this.pages[a]=[]),l=s.max(-r[h].offsetLeft,this.maxScrollX),n=s.max(-r[h].offsetTop,this.maxScrollY),e=l-s.round(r[h].offsetWidth/2),o=n-s.round(r[h].offsetHeight/2),this.pages[a][i]={x:l,y:n,width:r[h].offsetWidth,height:r[h].offsetHeight,cx:e,cy:o},l>this.maxScrollX&&a++;this.goToPage(this.currentPage.pageX||0,this.currentPage.pageY||0,0),this.options.snapThreshold%1===0?(this.snapThresholdX=this.options.snapThreshold,this.snapThresholdY=this.options.snapThreshold):(this.snapThresholdX=s.round(this.pages[this.currentPage.pageX][this.currentPage.pageY].width*this.options.snapThreshold),this.snapThresholdY=s.round(this.pages[this.currentPage.pageX][this.currentPage.pageY].height*this.options.snapThreshold))}}),this.on("flick",function(){var t=this.options.snapSpeed||s.max(s.max(s.min(s.abs(this.x-this.startX),1e3),s.min(s.abs(this.y-this.startY),1e3)),300);this.goToPage(this.currentPage.pageX+this.directionX,this.currentPage.pageY+this.directionY,t)})},_nearestSnap:function(t,i){if(!this.pages.length)return{x:0,y:0,pageX:0,pageY:0};var e=0,o=this.pages.length,n=0;if(s.abs(t-this.absStartX)<this.snapThresholdX&&s.abs(i-this.absStartY)<this.snapThresholdY)return this.currentPage;for(t>0?t=0:t<this.maxScrollX&&(t=this.maxScrollX),i>0?i=0:i<this.maxScrollY&&(i=this.maxScrollY);o>e;e++)if(t>=this.pages[e][0].cx){t=this.pages[e][0].x;break}for(o=this.pages[e].length;o>n;n++)if(i>=this.pages[0][n].cy){i=this.pages[0][n].y;break}return e==this.currentPage.pageX&&(e+=this.directionX,0>e?e=0:e>=this.pages.length&&(e=this.pages.length-1),t=this.pages[e][0].x),n==this.currentPage.pageY&&(n+=this.directionY,0>n?n=0:n>=this.pages[0].length&&(n=this.pages[0].length-1),i=this.pages[0][n].y),{x:t,y:i,pageX:e,pageY:n}},goToPage:function(t,i,e,o){o=o||this.options.bounceEasing,t>=this.pages.length?t=this.pages.length-1:0>t&&(t=0),i>=this.pages[t].length?i=this.pages[t].length-1:0>i&&(i=0);var n=this.pages[t][i].x,r=this.pages[t][i].y;e=void 0===e?this.options.snapSpeed||s.max(s.max(s.min(s.abs(n-this.x),1e3),s.min(s.abs(r-this.y),1e3)),300):e,this.currentPage={x:n,y:r,pageX:t,pageY:i},this.scrollTo(n,r,e,o)},next:function(t,i){var s=this.currentPage.pageX,e=this.currentPage.pageY;s++,s>=this.pages.length&&this.hasVerticalScroll&&(s=0,e++),this.goToPage(s,e,t,i)},prev:function(t,i){var s=this.currentPage.pageX,e=this.currentPage.pageY;s--,0>s&&this.hasVerticalScroll&&(s=0,e--),this.goToPage(s,e,t,i)},_initKeys:function(i){var s,e={pageUp:33,pageDown:34,end:35,home:36,left:37,up:38,right:39,down:40};if("object"==typeof this.options.keyBindings)for(s in this.options.keyBindings)"string"==typeof this.options.keyBindings[s]&&(this.options.keyBindings[s]=this.options.keyBindings[s].toUpperCase().charCodeAt(0));else this.options.keyBindings={};for(s in e)this.options.keyBindings[s]=this.options.keyBindings[s]||e[s];h.addEvent(t,"keydown",this),this.on("destroy",function(){h.removeEvent(t,"keydown",this)})},_key:function(t){if(this.enabled){var i,e=this.options.snap,o=e?this.currentPage.pageX:this.x,n=e?this.currentPage.pageY:this.y,r=h.getTime(),a=this.keyTime||0,l=.25;switch(this.options.useTransition&&this.isInTransition&&(i=this.getComputedPosition(),this._translate(s.round(i.x),s.round(i.y)),this.isInTransition=!1),this.keyAcceleration=200>r-a?s.min(this.keyAcceleration+l,50):0,t.keyCode){case this.options.keyBindings.pageUp:this.hasHorizontalScroll&&!this.hasVerticalScroll?o+=e?1:this.wrapperWidth:n+=e?1:this.wrapperHeight;break;case this.options.keyBindings.pageDown:this.hasHorizontalScroll&&!this.hasVerticalScroll?o-=e?1:this.wrapperWidth:n-=e?1:this.wrapperHeight;break;case this.options.keyBindings.end:o=e?this.pages.length-1:this.maxScrollX,n=e?this.pages[0].length-1:this.maxScrollY;break;case this.options.keyBindings.home:o=0,n=0;break;case this.options.keyBindings.left:o+=e?-1:5+this.keyAcceleration>>0;break;case this.options.keyBindings.up:n+=e?1:5+this.keyAcceleration>>0;break;case this.options.keyBindings.right:o-=e?-1:5+this.keyAcceleration>>0;break;case this.options.keyBindings.down:n-=e?1:5+this.keyAcceleration>>0;break;default:return}if(e)return void this.goToPage(o,n);o>0?(o=0,this.keyAcceleration=0):o<this.maxScrollX&&(o=this.maxScrollX,this.keyAcceleration=0),n>0?(n=0,this.keyAcceleration=0):n<this.maxScrollY&&(n=this.maxScrollY,this.keyAcceleration=0),this.scrollTo(o,n,0),this.keyTime=r}},_animate:function(t,i,s,e){function o(){var d,u,m,f=h.getTime();return f>=p?(n.isAnimating=!1,n._translate(t,i),void(n.resetPosition(n.options.bounceTime)||n._execEvent("scrollEnd"))):(f=(f-c)/s,m=e(f),d=(t-a)*m+a,u=(i-l)*m+l,n._translate(d,u),void(n.isAnimating&&r(o)))}var n=this,a=this.x,l=this.y,c=h.getTime(),p=c+s;this.isAnimating=!0,o()},handleEvent:function(t){switch(t.type){case"touchstart":case"pointerdown":case"MSPointerDown":case"mousedown":this._start(t);break;case"touchmove":case"pointermove":case"MSPointerMove":case"mousemove":this._move(t);break;case"touchend":case"pointerup":case"MSPointerUp":case"mouseup":case"touchcancel":case"pointercancel":case"MSPointerCancel":case"mousecancel":this._end(t);break;case"orientationchange":case"resize":this._resize();break;case"transitionend":case"webkitTransitionEnd":case"oTransitionEnd":case"MSTransitionEnd":this._transitionEnd(t);break;case"wheel":case"DOMMouseScroll":case"mousewheel":this._wheel(t);break;case"keydown":this._key(t);break;case"click":t._constructed||(t.preventDefault(),t.stopPropagation())}}},n.prototype={handleEvent:function(t){switch(t.type){case"touchstart":case"pointerdown":case"MSPointerDown":case"mousedown":this._start(t);break;case"touchmove":case"pointermove":case"MSPointerMove":case"mousemove":this._move(t);break;case"touchend":case"pointerup":case"MSPointerUp":case"mouseup":case"touchcancel":case"pointercancel":case"MSPointerCancel":case"mousecancel":this._end(t)}},destroy:function(){this.options.interactive&&(h.removeEvent(this.indicator,"touchstart",this),h.removeEvent(this.indicator,h.prefixPointerEvent("pointerdown"),this),h.removeEvent(this.indicator,"mousedown",this),h.removeEvent(t,"touchmove",this),h.removeEvent(t,h.prefixPointerEvent("pointermove"),this),h.removeEvent(t,"mousemove",this),h.removeEvent(t,"touchend",this),h.removeEvent(t,h.prefixPointerEvent("pointerup"),this),h.removeEvent(t,"mouseup",this)),this.options.defaultScrollbars&&this.wrapper.parentNode.removeChild(this.wrapper)},_start:function(i){var s=i.touches?i.touches[0]:i;i.preventDefault(),i.stopPropagation(),this.transitionTime(),this.initiated=!0,this.moved=!1,this.lastPointX=s.pageX,this.lastPointY=s.pageY,this.startTime=h.getTime(),this.options.disableTouch||h.addEvent(t,"touchmove",this),this.options.disablePointer||h.addEvent(t,h.prefixPointerEvent("pointermove"),this),this.options.disableMouse||h.addEvent(t,"mousemove",this),this.scroller._execEvent("beforeScrollStart")},_move:function(t){var i,s,e,o,n=t.touches?t.touches[0]:t;h.getTime();this.moved||this.scroller._execEvent("scrollStart"),this.moved=!0,i=n.pageX-this.lastPointX,this.lastPointX=n.pageX,s=n.pageY-this.lastPointY,this.lastPointY=n.pageY,e=this.x+i,o=this.y+s,this._pos(e,o),t.preventDefault(),t.stopPropagation()},_end:function(i){if(this.initiated){if(this.initiated=!1,i.preventDefault(),i.stopPropagation(),h.removeEvent(t,"touchmove",this),h.removeEvent(t,h.prefixPointerEvent("pointermove"),this),h.removeEvent(t,"mousemove",this),this.scroller.options.snap){var e=this.scroller._nearestSnap(this.scroller.x,this.scroller.y),o=this.options.snapSpeed||s.max(s.max(s.min(s.abs(this.scroller.x-e.x),1e3),s.min(s.abs(this.scroller.y-e.y),1e3)),300);this.scroller.x==e.x&&this.scroller.y==e.y||(this.scroller.directionX=0,this.scroller.directionY=0,this.scroller.currentPage=e,this.scroller.scrollTo(e.x,e.y,o,this.scroller.options.bounceEasing))}this.moved&&this.scroller._execEvent("scrollEnd")}},transitionTime:function(t){t=t||0,this.indicatorStyle[h.style.transitionDuration]=t+"ms",!t&&h.isBadAndroid&&(this.indicatorStyle[h.style.transitionDuration]="0.001s")},transitionTimingFunction:function(t){this.indicatorStyle[h.style.transitionTimingFunction]=t},refresh:function(){this.transitionTime(),this.options.listenX&&!this.options.listenY?this.indicatorStyle.display=this.scroller.hasHorizontalScroll?"block":"none":this.options.listenY&&!this.options.listenX?this.indicatorStyle.display=this.scroller.hasVerticalScroll?"block":"none":this.indicatorStyle.display=this.scroller.hasHorizontalScroll||this.scroller.hasVerticalScroll?"block":"none",this.scroller.hasHorizontalScroll&&this.scroller.hasVerticalScroll?(h.addClass(this.wrapper,"iScrollBothScrollbars"),h.removeClass(this.wrapper,"iScrollLoneScrollbar"),this.options.defaultScrollbars&&this.options.customStyle&&(this.options.listenX?this.wrapper.style.right="8px":this.wrapper.style.bottom="8px")):(h.removeClass(this.wrapper,"iScrollBothScrollbars"),h.addClass(this.wrapper,"iScrollLoneScrollbar"),this.options.defaultScrollbars&&this.options.customStyle&&(this.options.listenX?this.wrapper.style.right="2px":this.wrapper.style.bottom="2px"));this.wrapper.offsetHeight;this.options.listenX&&(this.wrapperWidth=this.wrapper.clientWidth,this.options.resize?(this.indicatorWidth=s.max(s.round(this.wrapperWidth*this.wrapperWidth/(this.scroller.scrollerWidth||this.wrapperWidth||1)),8),this.indicatorStyle.width=this.indicatorWidth+"px"):this.indicatorWidth=this.indicator.clientWidth,this.maxPosX=this.wrapperWidth-this.indicatorWidth,"clip"==this.options.shrink?(this.minBoundaryX=-this.indicatorWidth+8,this.maxBoundaryX=this.wrapperWidth-8):(this.minBoundaryX=0,this.maxBoundaryX=this.maxPosX),this.sizeRatioX=this.options.speedRatioX||this.scroller.maxScrollX&&this.maxPosX/this.scroller.maxScrollX),this.options.listenY&&(this.wrapperHeight=this.wrapper.clientHeight,this.options.resize?(this.indicatorHeight=s.max(s.round(this.wrapperHeight*this.wrapperHeight/(this.scroller.scrollerHeight||this.wrapperHeight||1)),8),this.indicatorStyle.height=this.indicatorHeight+"px"):this.indicatorHeight=this.indicator.clientHeight,this.maxPosY=this.wrapperHeight-this.indicatorHeight,"clip"==this.options.shrink?(this.minBoundaryY=-this.indicatorHeight+8,this.maxBoundaryY=this.wrapperHeight-8):(this.minBoundaryY=0,this.maxBoundaryY=this.maxPosY),this.maxPosY=this.wrapperHeight-this.indicatorHeight,this.sizeRatioY=this.options.speedRatioY||this.scroller.maxScrollY&&this.maxPosY/this.scroller.maxScrollY),this.updatePosition()},updatePosition:function(){var t=this.options.listenX&&s.round(this.sizeRatioX*this.scroller.x)||0,i=this.options.listenY&&s.round(this.sizeRatioY*this.scroller.y)||0;this.options.ignoreBoundaries||(t<this.minBoundaryX?("scale"==this.options.shrink&&(this.width=s.max(this.indicatorWidth+t,8),this.indicatorStyle.width=this.width+"px"),t=this.minBoundaryX):t>this.maxBoundaryX?"scale"==this.options.shrink?(this.width=s.max(this.indicatorWidth-(t-this.maxPosX),8),this.indicatorStyle.width=this.width+"px",t=this.maxPosX+this.indicatorWidth-this.width):t=this.maxBoundaryX:"scale"==this.options.shrink&&this.width!=this.indicatorWidth&&(this.width=this.indicatorWidth,this.indicatorStyle.width=this.width+"px"),i<this.minBoundaryY?("scale"==this.options.shrink&&(this.height=s.max(this.indicatorHeight+3*i,8),this.indicatorStyle.height=this.height+"px"),i=this.minBoundaryY):i>this.maxBoundaryY?"scale"==this.options.shrink?(this.height=s.max(this.indicatorHeight-3*(i-this.maxPosY),8),this.indicatorStyle.height=this.height+"px",i=this.maxPosY+this.indicatorHeight-this.height):i=this.maxBoundaryY:"scale"==this.options.shrink&&this.height!=this.indicatorHeight&&(this.height=this.indicatorHeight,this.indicatorStyle.height=this.height+"px")),this.x=t,this.y=i,this.scroller.options.useTransform?this.indicatorStyle[h.style.transform]="translate("+t+"px,"+i+"px)"+this.scroller.translateZ:(this.indicatorStyle.left=t+"px",this.indicatorStyle.top=i+"px")},_pos:function(t,i){0>t?t=0:t>this.maxPosX&&(t=this.maxPosX),0>i?i=0:i>this.maxPosY&&(i=this.maxPosY),t=this.options.listenX?s.round(t/this.sizeRatioX):this.scroller.x,i=this.options.listenY?s.round(i/this.sizeRatioY):this.scroller.y,this.scroller.scrollTo(t,i)},fade:function(t,i){if(!i||this.visible){clearTimeout(this.fadeTimeout),this.fadeTimeout=null;var s=t?250:500,e=t?0:300;t=t?"1":"0",this.wrapperStyle[h.style.transitionDuration]=s+"ms",this.fadeTimeout=setTimeout(function(t){this.wrapperStyle.opacity=t,this.visible=+t}.bind(this,t),e)}}},e.utils=h,"undefined"!=typeof module&&module.exports?module.exports=e:t.IScroll=e}(window,document,Math);
/*! tinycolorpicker - v0.9.4 - 2015-11-20
 * http://www.baijs.com/tinycolorpicker
 *
 * Copyright (c) 2015 Maarten Baijs <wieringen@gmail.com>;
 * Licensed under the MIT license */

!function(a){"function"==typeof define&&define.amd?define(["jquery"],a):"object"==typeof exports?module.exports=a(require("jquery")):a(jQuery)}(function(a){function b(b,e){function f(){return s?(m=a("<canvas></canvas>"),k.append(m),q=m[0].getContext("2d"),g()):a.each(j.options.colors,function(a,b){var c=p.clone();c.css("backgroundColor",b),c.attr("data-color",b),o.append(c)}),h(),j}function g(){var b=new Image,c=k.css("background-image").replace(/"/g,"").replace(/url\(|\)$/gi,"");b.crossOrigin="Anonymous",k.css("background-image","none"),a(b).load(function(){m.attr("width",this.width),m.attr("height",this.height),q.drawImage(b,0,0,this.width,this.height)}),b.src=j.options.backgroundUrl||c}function h(){var b=t?"touchstart":"mousedown";s?(l.bind(b,function(b){b.preventDefault(),b.stopPropagation(),k.toggle(),a(document).bind("mousedown.colorpicker",function(){a(document).unbind(".colorpicker"),j.close()})}),t?(m.bind("touchstart",function(a){return r=!0,i(a.originalEvent.touches[0]),!1}),m.bind("touchmove",function(a){return i(a.originalEvent.touches[0]),!1}),m.bind("touchend",function(){return j.close(),!1})):(m.mousedown(function(b){return r=!0,i(b),a(document).bind("mouseup.colorpicker",function(){return a(document).unbind(".colorpicker"),j.close(),!1}),!1}),m.mousemove(i))):(l.bind("mousedown",function(a){a.preventDefault(),a.stopPropagation(),o.toggle()}),o.delegate("li","mousedown",function(b){b.preventDefault(),b.stopImmediatePropagation();var c=a(this).attr("data-color");j.setColor(c),o.hide()}))}function i(c){if(r){var d=a(c.target),e=d.offset(),f=q.getImageData(c.pageX-e.left,c.pageY-e.top,1,1).data;j.setColor("rgb("+f[0]+","+f[1]+","+f[2]+")"),b.trigger("change",[j.colorHex,j.colorRGB])}}this.options=a.extend({},d,e),this._defaults=d,this._name=c;var j=this,k=b.find(".track"),l=b.find(".color"),m=null,n=b.find(".colorInput"),o=b.find(".dropdown"),p=o.find("li").remove(),q=null,r=!1,s=!!document.createElement("canvas").getContext,t="ontouchstart"in document.documentElement;return this.colorHex="",this.colorRGB="",this.setColor=function(a){a.indexOf("#")>=0?(j.colorHex=a,j.colorRGB=j.hexToRgb(j.colorHex)):(j.colorRGB=a,j.colorHex=j.rgbToHex(j.colorRGB)),l.find(".colorInner").css("backgroundColor",j.colorHex),n.val(j.colorHex)},this.close=function(){r=!1,k.hide()},this.hexToRgb=function(a){var b=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(a);return"rgb("+parseInt(b[1],16)+","+parseInt(b[2],16)+","+parseInt(b[3],16)+")"},this.rgbToHex=function(a){function b(a){var b=new Array("0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F");return isNaN(a)?"00":b[(a-a%16)/16]+b[a%16]}var c=a.match(/\d+/g);return"#"+b(c[0])+b(c[1])+b(c[2])},f()}var c="tinycolorpicker",d={colors:["#ffffff","#A7194B","#FE2712","#FB9902","#FABC02","#FEFE33","#D0EA2B","#66B032","#0391CE","#0247FE","#3D01A5","#8601AF"],backgroundUrl:null};a.fn[c]=function(d){return this.each(function(){a.data(this,"plugin_"+c)||a.data(this,"plugin_"+c,new b(a(this),d))})}});
;

var TouchUI = function() {
	this.core.init.call(this);
	this.knockout.viewModel.call(this);
	this.knockout.bindings.call(this);
	return this.core.bridge.call(this);
};

TouchUI.prototype = {
	constructor: TouchUI,
	isActive: ko.observable(false),

	settings: {
		id: "touch",
		version: 0,

		isFullscreen: ko.observable(false),
		isTouchscreen: ko.observable(false),
		isEpiphanyOrKweb: (window.navigator.userAgent.indexOf("AppleWebKit") !== -1 && window.navigator.userAgent.indexOf("ARM Mac OS X") !== -1),

		hasFullscreen: ko.observable(document.webkitCancelFullScreen || document.msCancelFullScreen || document.oCancelFullScreen || document.mozCancelFullScreen || document.cancelFullScreen),
		hasLocalStorage: ('localStorage' in window),
		hasTouch: ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0),

		canLoadAutomatically: ($("#loadsomethingsomethingdarkside").length > 0),
		touchuiModal: $('#touchui_settings_dialog'),

		whatsNew: ko.observable(false)
	},

	core: {},
	components: {},
	knockout: {},
	plugins: {},
	animate: {
		isHidebarActive: ko.observable(false)
	},
	DOM: {
		create: {},
		move: {},
		overwrite: {}
	},
	scroll: {

		defaults: {
			iScroll: {
				scrollbars: true,
				mouseWheel: true,
				interactiveScrollbars: true,
				shrinkScrollbars: "scale",
				fadeScrollbars: true,
				disablePointer: true
			}
		},

		iScrolls: {},
		currentActive: null
	}

}

TouchUI.prototype.animate.hide = function(what) {
	var self = this;

	//Lets hide the navbar by scroll
	if( what === "navbar" ) {
		if( this.animate.isHidebarActive() ) {
			var navbar = $("#navbar"),
				navbarHeight = parseFloat(navbar.height());

			if( this.settings.hasTouch ) {
				// Hide navigation bar on mobile
				window.scrollTo(0,1);

				if(parseFloat($("html,body").prop('scrollHeight')) > ($(window).height() + navbarHeight)) {//hasEnoughScroll?
					$("html,body").stop().animate({
						scrollTop: navbarHeight
					}, 160, "swing");
				}

			} else {
				var scroll = self.scroll.iScrolls.body;

				if(scroll.isAnimating) {
					setTimeout(function() {
						self.animate.hide.call(self, what);
					}, 10);
					return;
				}

				setTimeout(function() {
					if(Math.abs(scroll.maxScrollY) > 0) {
						scroll.scrollTo(0, -navbarHeight, 160);
					}
				}, 0);

			}
		}
	}

}

TouchUI.prototype.components.dropdown = {

	init: function() {
		this.components.dropdown.toggleSubmenu.call( this );
		this.components.dropdown.toggle.call( this );
	},

	// Rewrite opening of dropdowns
	toggle: function() {
		var self = this;
		var namespace = ".touchui.dropdown";

		$(document)
			.off('.dropdown')
			.on('touchstart.dropdown.data-api', '.dropdown-menu', function (e) { e.stopPropagation() })
			.on('click.dropdown.data-api', '[data-toggle=dropdown]', function(e) {
				var $dropdownToggle = $(e.currentTarget);
				var $dropdownContainer = $dropdownToggle.parent();

				// Stop the hashtag from propagating
				e.preventDefault();

				// Toggle the targeted dropdown
				$dropdownContainer.toggleClass("open");

				// Refresh current scroll and add a min-height so we can reach the dropdown if needed
				self.components.dropdown.containerMinHeight.call(self, $dropdownContainer, $dropdownToggle);

				// Skip everything if we are in a dropdown toggling a dropdown (one click event is enuff!)
				if( $dropdownContainer.parents('.open > .dropdown-menu').length > 0 ) {
					return;
				}

				// Remove all other active dropdowns
				$('.open [data-toggle="dropdown"]').not($dropdownToggle).parent().removeClass('open');

				if ( !self.settings.hasTouch ) {
					self.scroll.iScrolls.terminal.disable();
				}

				$(document).off("click"+namespace).on("click"+namespace, function(eve) {
					// Check if we scrolled (touch devices wont trigger this click event after scrolling so assume we didn't move)
					var moved = ( !self.settings.hasTouch ) ? self.scroll.currentActive.moved : false,
						$target = $(eve.target);

					if (
						!moved && // If scrolling did not move
						$target.parents(".ui-pnotify").length === 0 && // if not a click within notifiaction
						(
							!$target.parents().is($dropdownContainer) || // if clicks are not made within the dropdown container
							$target.is('a:not([data-toggle="dropdown"])') // Unless it's a link but not a [data-toggle]
						)
					) {
						$(document).off(eve);
						$dropdownContainer.removeClass('open');

						if ( !self.settings.hasTouch ) {
							$('.octoprint-container').css("min-height", 0);
							self.scroll.currentActive.refresh();
							self.scroll.iScrolls.terminal.enable();
						}
					}
				});
			});

	},

	// Support 1.3.0 onMouseOver dropdowns
	toggleSubmenu: function() {
		$(".dropdown-submenu").addClass("dropdown");
		$(".dropdown-submenu > a").attr("data-toggle", "dropdown");
	},

	// Refresh current scroll and add a min-height so we can reach the dropdown if needed
	containerMinHeight: function($dropdownContainer, $dropdownToggle) {
		var self = this;

		// Touch devices can reach the dropdown by CSS, only if we're using iScroll
		if ( !self.settings.hasTouch ) {
			// Get active container
			var $container = ($dropdownContainer.parents('.modal').length === 0 ) ? $('.octoprint-container') : $dropdownContainer.parents('.modal .modal-body');

			// If we toggle within the dropdown then get the parent dropdown for total height
			var $dropdownMenu = ( $dropdownContainer.parents('.open > .dropdown-menu').length > 0 ) ? $dropdownContainer.parents('.open > .dropdown-menu') : $dropdownToggle.next();

			setTimeout(function() {

				//If the main dropdown has closed (by toggle) then let's remove the min-height else
				if(!$dropdownMenu.parent().hasClass("open")) {
					$container.css("min-height", 0);
					self.scroll.currentActive.refresh();
				} else {
					var y = Math.abs(self.scroll.currentActive.y),
						height = $dropdownMenu.outerHeight(),
						top = $dropdownMenu.offset().top;

					$container.css("min-height", y + top + height);
					self.scroll.currentActive.refresh();
				}

			}, 0);
		}
	}

}

TouchUI.prototype.components.fullscreen = {
	init: function() {
		var self = this;

		// Bind fullscreenChange to knockout
		$(document).bind("fullscreenchange", function() {
			self.settings.isFullscreen($(document).fullScreen() !== false);
			self.DOM.storage.set("fullscreen", self.settings.isFullscreen());
		});

	},
	ask: function() {
		var self = this;

		if(self.settings.hasFullscreen()) {

			new PNotify({
				title: 'Fullscreen',
				text: 'Would you like to go fullscreen?',
				icon: 'glyphicon glyphicon-question-sign',
				type: 'info',
				hide: false,
				addclass: 'askFullscreen',
				confirm: {
					confirm: true,
					buttons: [{
						text: 'Yes',
						addClass: 'btn-primary',
						click: function(notice) {
							notice.remove();
							$(document).fullScreen(true);
						}
					}, {
						text: 'No',
						click: function(notice) {
							notice.remove();
							$(document).trigger("fullscreenchange");
						}
					}]
				},
				buttons: {
					closer: false,
					sticker: false
				},
				history: {
					history: false
				}
			});
		}

	}
}

TouchUI.prototype.components.keyboard = {

	isActive: ko.observable(false),
	config: {

		default: {

			display: {
				'accept' :  "Save",
				'bksp'   :  " ",
				'default': 'ABC',
				'meta1'  : '.?123',
				'meta2'  : '#+='
			},

			layout: 'custom',
			customLayout: {
				'default': [
					'a z e r t y u i o p',
					'q s d f g h j k l m',
					'{bksp} {s} w x c v b n',
					'{accept} {c} {left} {right} {meta1} {space}'
				],
				'shift': [
					'A Z E R T Y U I O P',
					'Q S D F G H J K L M',
					'{bksp} {s} W X C V B N',
					'{accept} {c} {left} {right} {meta1} {space}'
				],
				'meta1': [
					'1 2 3 4 5 6 7 8 9 0',
					'- / : ; ( ) \u20ac & @',
					'{bksp} {meta2} . , ? ! \' "',
					'{accept} {c} {left} {right} {default} {space}'
				],
				'meta2': [
					'[ ] { } # % ^ * + =',
					'_ \\ | ~ < > $ \u00a3 \u00a5',
					'{bksp} {meta1} . , ? ! \' "',
					'{accept} {c} {left} {right} {default} {space}'
				]
			}

		},
		terminal: {
			display: {
				'bksp'   :  " ",
				'accept' : 'Save',
				'default': 'ABC',
				'meta1'  : '.?123',
				'meta2'  : '#+='
			},

			layout: 'custom',
			customLayout: {
				'default': [
					'Q W E R T Y U I O P',
					'A S D F G H J K L',
					'{bksp} {s} Z X C V B N M',
					'{accept} {c} {left} {right} {meta1} {space}'
				],
				'meta1': [
					'1 2 3 4 5 6 7 8 9 0',
					'- / : ; ( ) \u20ac & @',
					'{bksp} {meta2} . , ? ! \' "',
					'{accept} {c} {left} {right} {default} {space}'
				],
				'meta2': [
					'[ ] { } # % ^ * + =',
					'_ \\ | ~ < > $ \u00a3 \u00a5',
					'{bksp} {meta1} . , ? ! \' "',
					'{accept} {c} {left} {right} {default} {space}'
				]
			}

		},
		number: {
			display: {
				'bksp'   :  " ",
				'a'      :  "Save",
				'c'      :  "Cancel"
			},

			layout: 'custom',
			customLayout: {
				'default' : [
					'{bksp} 1 2 3 4 5 6 7 ',
					'{accept} {c} {left} {right} 8 9 0 - , . '
				]
			},
		}


	},

	init: function() {
		var self = this;

		// Add virtual keyboard
		var obj = {
			visible: self.components.keyboard.onShow,
			beforeClose: self.components.keyboard.onClose
		};

		var notThis = ['[type="file"]','[type="checkbox"]','[type="radio"]'];
		$(document).on("mousedown", 'input:not('+notThis+'), textarea', function(e) {
			var $elm = $(e.target);

			if(!self.components.keyboard.isActive()) {

				if($elm.data("keyboard")) {
					$elm.data("keyboard").close().destroy();
				}

			} else {

				if(!self.settings.hasTouch) {

					// Force iScroll to stop following the mouse (bug)
					self.scroll.currentActive._end(e);
					setTimeout(function() {
						self.scroll.currentActive.scrollToElement($elm[0], 200, 0, -30);
					}, 0);

				}

				// $elm already has a keyboard
				if($elm.data("keyboard")) {
					$elm.data('keyboard').reveal();
					return;
				}

				if($elm.attr("type") === "number") {
					$elm.keyboard($.extend(self.components.keyboard.config.number, obj));
				} else if($elm.attr("id") === "terminal-command") {
					$elm.keyboard($.extend(self.components.keyboard.config.terminal, obj));
				} else {
					$elm.keyboard($.extend(self.components.keyboard.config.default, obj));
				}
			}

		});
	},

	onShow: function(event, keyboard, el) {
		keyboard.$keyboard.find("button").on("mousedown", function(e) {
			$(e.target).addClass("touch-focus");

			if(typeof $(e.target).data("timeout") !== "function") {
				clearTimeout($(e.target).data("timeout"));
			}
			var timeout = setTimeout(function() {
				$(e.target).removeClass("touch-focus").data("timeout", "");
			}, 600);
			$(e.target).data("timeout", timeout);
		});
	},

	onClose: function(event, keyboard, el) {
		keyboard.$keyboard.find("button").off("mousedown");
	}

}

TouchUI.prototype.components.modal = {

	init: function() {
		if($("#settings_dialog_menu").length > 0) {
			this.components.modal.dropdown.create.call(this, "#settings_dialog_menu", "special-dropdown-uni", "#settings_dialog_label");
		}
		if($("#usersettings_dialog ul.nav").length > 0) {
			this.components.modal.dropdown.create.call(this, "#usersettings_dialog ul.nav", "special-dropdown-uni-2", "#usersettings_dialog h3");
		}
	},

	dropdown: {
		create: function(cloneId, newId, appendTo) {
			var self = this;

			// Remove unwanted whitespaces
			$(appendTo).text($(appendTo).text().trim());

			// Create a label that is clickable
			var $settingsLabel = $("<span></span>")
				.addClass("hidden")
				.attr("id", newId)
				.appendTo(appendTo)
				.text($(cloneId+" .active").text().trim())
				.on("click", function(e) {

					// Stop if we clicked on the dropdown and stop the dropdown from regenerating more then once
					if(e.target !== this || (e.target === this && $(".show-dropdown").length > 0)) {
						return;
					}

					// Clone the main settings menu
					var elm = $(cloneId)
						.clone()
						.attr("id", "")
						.appendTo(this)
						.addClass("show-dropdown");

					// Add click binder to close down the dropdown
					$(document).on("click", function(event) {

						if(
							$(event.target).closest('[data-toggle="tab"]').length > 0 || //Check if we clicked on a tab-link
							$(event.target).closest("#"+newId).length === 0 //Check if we clicked outside the dropdown
						) {
							var href = $settingsLabel.find(".active").find('[data-toggle="tab"]').attr("href");
							$(document).off(event).trigger("dropdown-closed.touchui"); // Trigger event for enabling scrolling

							$('.show-dropdown').remove();
							$('[href="'+href+'"]').click();
							$settingsLabel.text($('[href="'+href+'"]').text());

							if( !self.settings.hasTouch ) {
								setTimeout(function() {
									self.scroll.modal.stack[self.scroll.modal.stack.length-1].refresh();
								}, 0);
							}
						}

					});

					// Trigger event for disabling scrolling
					$(document).trigger("dropdown-open.touchui", elm[0]);
				});

			// reset the active text in dropdown on open
			$(appendTo)
				.closest(".modal")
				.on("modal.touchui", function() {
					var href = $(cloneId)
						.find(".active")
						.find('[data-toggle="tab"]')
						.attr("href");

					$settingsLabel.text($('[href="'+href+'"]').text());
				});

		}
	}
}

TouchUI.prototype.components.slider = {

	init: function() {

		ko.bindingHandlers.slider = {
			init: function (element, valueAccessor) {
				var $element = $(element);

				// Set value on input field
				$element.val(valueAccessor().value());

				// Create container
				var div = $('<div class="slider-container"></div>').insertBefore(element);

				// Wait untill next DOM bindings are executed
				setTimeout(function() {
					var $button = $(element).next('button');
					var id = _.uniqueId("ui-inp");

					$button.appendTo(div);
					$element.appendTo(div);

					$(div).find('input').attr("id", id);

					var lbl = $('<label for="' + id + '" style="display: inline-block;">' + $button.text().split(":")[0].replace(" ", "") + ':</label>');
					lbl.appendTo('.octoprint-container')
					$element.attr("style", "padding-left:" + (lbl.width() + 15) + "px");
					lbl.appendTo(div);

				}, 60);

				$element.on("change", function(e) {
					valueAccessor().value($element.val());
				}).attr({
					max: valueAccessor().max,
					min: valueAccessor().min,
					step: valueAccessor().step,
				});

			},
			update: function (element, valueAccessor) {
				$(element).val(valueAccessor().value());
			}
		};

	}

}

TouchUI.prototype.components.touchList = {
	init: function() {

		/* Add touch friendly files list */
		var self = this;
		var touch = false;
		var start = 0;
		var namespace = ".files.touchui";

		$(document).on("mousedown touchstart", "#files .entry:not(.folder, .back), #temp .row-fluid", function(e) {
			try {
				touch = e.currentTarget;
				start = e.pageX || e.originalEvent.targetTouches[0].pageX;
			} catch(err) {
				return;
			}

			$(document).one("mouseup"+namespace+" touchend"+namespace, function(e) {
				touch = false;
				start = 0;

				$(document).off(namespace);
			});

			$(document).on("mousemove"+namespace+" touchmove"+namespace, function(event) {
				if(touch !== false) {
					try {
						var current = event.pageX || event.originalEvent.targetTouches[0].pageX;

						if(current > start + 80) {
							$(document).trigger("fileclose" + namespace, event.target);
							$(touch).removeClass("open");
							start = current;
						} else if(current < start - 80) {
							$(document).trigger("fileopen" + namespace, event.target);
							$(touch).addClass("open");
							start = current;

							if( $(touch).find(".btn-group").children().length > 4 ) {
								$(touch).addClass("large");
							}
						}
					} catch(err) {
						//Ignore step
					}
				}
			});

		});

	}

}

TouchUI.prototype.components.touchscreen = {

	init: function () {
		$("html").addClass("isTouchscreenUI");
		this.settings.hasTouch = false;
		this.settings.isTouchscreen(true);

		if (this.settings.isEpiphanyOrKweb) {
			this.settings.hasFullscreen(false);
		}

		$('.modal.fade').removeClass('fade');

		// Improve performace
		this.scroll.defaults.iScroll.scrollbars = false;
		this.scroll.defaults.iScroll.interactiveScrollbars = false;
		this.scroll.defaults.iScroll.useTransition = false;
		// this.scroll.defaults.iScroll.useTransform = false;
		// this.scroll.defaults.iScroll.HWCompositing = false;
	},

	isLoading: function (viewModels) {

		if(this.settings.isTouchscreen()) {
			// Disable fancy functionality
			if(viewModels.terminalViewModel.enableFancyFunctionality) { //TODO: check if 1.2.9 to not throw errors in 1.2.8<
				 viewModels.terminalViewModel.enableFancyFunctionality(false);
			}

			// Disable GCodeViewer in touchscreen mode
			if (viewModels.gcodeViewModel) {
				console.info("TouchUI: Disabling GCodeViewer in touchscreen mode...");
				viewModels.gcodeViewModel.enabled = false;
				viewModels.gcodeViewModel.initialize = _.noop;
				viewModels.gcodeViewModel._processData = _.noop;
				$("#gcode_link2").hide();
			}
		}

	}

}

TouchUI.prototype.core.init = function() {

	// Migrate old cookies into localstorage
	this.DOM.storage.migration.call(this);

	// Bootup TouchUI if Touch, Small resolution or storage say's so
	if (this.core.boot.call(this)) {

		$("html").attr("id", this.settings.id);

		// Force mobile browser to set the window size to their format
		$('<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1, user-scalable=no, minimal-ui">').appendTo("head");
		$('<meta name="apple-mobile-web-app-capable" content="yes">').appendTo("head");
		$('<meta name="mobile-web-app-capable" content="yes">').appendTo("head");

		this.isActive(true);

		// Enforce active cookie
		this.DOM.storage.set("active", true);

		// Create keyboard cookie if not existing
		if (this.DOM.storage.get("keyboardActive") === undefined) {
			if (!this.settings.hasTouch) {
				this.DOM.storage.set("keyboardActive", true);
			} else {
				this.DOM.storage.set("keyboardActive", false);
			}
		}

		// Create hide navbar on click if not existing
		if (this.DOM.storage.get("hideNavbarActive") === undefined) {
			this.DOM.storage.set("hideNavbarActive", false);
		}

		// Treat KWEB3 as a special Touchscreen mode or enabled by cookie
		if (this.settings.isEpiphanyOrKweb || this.DOM.storage.get("touchscreenActive")) {
			this.components.touchscreen.init.call(this);
		}

		// Create fullscreen cookie if not existing and trigger pNotification
		if (this.DOM.storage.get("fullscreen") === undefined) {
			this.DOM.storage.set("fullscreen", false);
			this.components.fullscreen.ask.call(this);
		} else {
			//Cookie say user wants fullscreen, ask it!
			if(this.DOM.storage.get("fullscreen")) {
				this.components.fullscreen.ask.call(this);
			}
		}

		// Get state of cookies and store them in KO
		this.components.keyboard.isActive(this.DOM.storage.get("keyboardActive"));
		this.animate.isHidebarActive(this.DOM.storage.get("hideNavbarActive"));
		this.settings.isFullscreen(this.DOM.storage.get("fullscreen"));

	}

}

TouchUI.prototype.core.boot = function() {

	// This should always start TouchUI
	if(
		document.location.hash === "#touch" ||
		document.location.href.indexOf("?touch") > 0 ||
		this.DOM.storage.get("active")
	) {

		return true;

	} else if(
		this.settings.canLoadAutomatically &&
		this.DOM.storage.get("active") !== false
	) {

		if($(window).width() < 980) {
			return true;
		}

		if(this.settings.hasTouch) {
			return true;
		}

	}

	return false;

}

TouchUI.prototype.core.bridge = function() {
	var self = this;

	this.core.bridge = {

		allViewModels: {},
		TOUCHUI_REQUIRED_VIEWMODELS: [
			"terminalViewModel",
			"connectionViewModel",
			"settingsViewModel",
			"softwareUpdateViewModel",
			"controlViewModel",
			"gcodeFilesViewModel",
			"navigationViewModel",
			"pluginManagerViewModel",
			"temperatureViewModel",
			"loginStateViewModel"
		],
		TOUCHUI_ELEMENTS: [
			"#touchui_settings_dialog",
			"#settings_plugin_touchui",
			"#navbar_plugin_touchui"
		],

		domLoading: function() {
			if (self.isActive()) {
				self.scroll.beforeLoad.call(self);
				self.DOM.init.call(self);
			}
		},

		domReady: function() {
			if (self.isActive()) {

				if(_.some(self.core.bridge.OCTOPRINT_VIEWMODELS, function(v) { return v[2] === "#gcode"; })) {
					self.core.bridge.TOUCHUI_REQUIRED_VIEWMODELS = self.core.bridge.TOUCHUI_REQUIRED_VIEWMODELS.concat(["gcodeViewModel"]);
				}

				self.components.dropdown.init.call(self);
				self.components.fullscreen.init.call(self);
				self.components.keyboard.init.call(self);
				self.components.modal.init.call(self);
				self.components.touchList.init.call(self);
				self.components.slider.init.call(self);

				self.scroll.init.call(self);
			}
		},

		koStartup: function TouchUIViewModel(viewModels) {
			self.core.bridge.allViewModels = _.object(self.core.bridge.TOUCHUI_REQUIRED_VIEWMODELS, viewModels);
			self.knockout.isLoading.call(self, self.core.bridge.allViewModels);
			return self;
		}
	}

	return this.core.bridge;
}

TouchUI.prototype.core.less = {

	options: {
		template: {
			importUrl:	"/plugin/touchui/static/less/touchui.bundled.less",
			import:		'@import "{importUrl}"; \n',
			variables:	"@main-color: {mainColor}; \n" +
						"@terminal-color: {termColor}; \n" +
						"@text-color: {textColor}; \n" +
						"@main-background: {bgColor}; \n\n"
		},
		API: "/plugin/touchui/css"
	},

	save: function() {
		var variables = "";
		var options = this.core.less.options;
		var self = this;

		if(self.settings.useCustomization()) {
			if(self.settings.colors.useLocalFile()) {

				$.get(options.API, {
						path: self.settings.colors.customPath()
					})
					.done(function(response) {
						self.core.less.render.call(self, options.template.import.replace("{importUrl}", options.template.importUrl) + response);
					})
					.error(function(error) {
						self.core.less.error.call(self, error);
					});

			} else {

				self.core.less.render.call(self, "" +
					options.template.import.replace("{importUrl}", options.template.importUrl) +
					options.template.variables.replace("{mainColor}", self.settings.colors.mainColor())
						.replace("{termColor}", self.settings.colors.termColor())
						.replace("{textColor}", self.settings.colors.textColor())
						.replace("{bgColor}", self.settings.colors.bgColor())
				);

			}
		}
	},

	render: function(data) {
		var self = this;
		var callback = function(error, result) {

				if (error) {
					self.core.less.error.call(self, error);
				} else {

					$.post(self.core.less.options.API, {
							css: result.css
						})
						.done(function() {
							if (self.settings.requireNewCSS()) {
								self.settings.refreshCSS("fast");
							}
						})
						.error(function(error) {
							self.core.less.error.call(self, error);
						});

				}
			}

		if(window.less.render) {
			window.less.render(data, {
				compress: true
			}, callback);
		} else {
			window.less.Parser({}).parse(data, function(error, result) {
				if(result) {
					result = {
						css: result.toCSS({
							compress: true
						})
					}
				}
				callback.call(this, error, result);
			});
		}
	},

	error: function(error) {
		var content = error.responseText;
		if(content && content.trim() && error.status !== 401) {
			new PNotify({
				title: 'TouchUI: Whoops, something went wrong...',
				text: content,
				icon: 'glyphicon glyphicon-question-sign',
				type: 'error',
				hide: false
			});
		}

	}

}

TouchUI.prototype.core.version = {

	init: function(softwareUpdateViewModel) {
		var self = this;

		$("<span></span>").appendTo("#terminal-output");

		if(softwareUpdateViewModel) {

			softwareUpdateViewModel.versions.items.subscribe(function(changes) {

				touchui = softwareUpdateViewModel.versions.getItem(function(elm) {
					return (elm.key === "touchui");
				}, true) || false;

				if( touchui !== false && touchui.information !== null ) {
					var remote = Number(touchui.information.remote.value.split('.').join('')),
						local = Number(touchui.information.local.value.split('.').join(''));

					if(remote > local) {
						$("#touch_updates_css").remove();
						$('head').append('<style id="touch_updates_css">#term pre span:first-child:before{ content: "v'+touchui.information.local.value+" outdated, new version: v"+touchui.information.remote.value+'" !important; }</style>');
					} else {
						if( $("#touch_updates_css").length === 0 ) {
							$('head').append('<style id="touch_updates_css">#term pre span:first-child:before{ content: "v'+touchui.information.local.value+'" !important; }</style>');
						}
					}
				}

			});

		}

	}

}

TouchUI.prototype.DOM.init = function() {

	// Create new tab with printer status and make it active
	this.DOM.create.printer.init(this.DOM.create.tabbar);
	this.DOM.create.printer.menu.$elm.find('a').trigger("click");

	// Create a new persistent dropdown
	this.DOM.create.dropdown.init.call( this.DOM.create.dropdown );

	// Move all other items from tabbar into dropdown
	this.DOM.move.tabbar.init.call(this);
	this.DOM.move.navbar.init.call(this);
	this.DOM.move.afterTabAndNav.call(this );
	this.DOM.move.overlays.init.call(this);
	this.DOM.move.terminal.init.call(this);

	// Move connection sidebar into a new modal
	this.DOM.move.connection.init(this.DOM.create.tabbar);

	// Manipulate controls div
	this.DOM.move.controls.init();

	// Disable these bootstrap/jquery plugins
	this.DOM.overwrite.tabdrop.call(self);
	this.DOM.overwrite.modal.call(self);

	// Add a webcam tab if it's defined
	if ($("#webcam_container").length > 0) {
		this.DOM.create.webcam.init(this.DOM.create.tabbar);
	}

	// Add class with how many tab-items
	$("#tabs, #navbar").addClass("items-" + $("#tabs li:not(.hidden_touch)").length);

	// Remove active class when clicking on a tab in the tabbar
	$('#tabs [data-toggle=tab]').on("click", function() {
		$("#all_touchui_settings").removeClass("item_active");
	});

}

TouchUI.prototype.DOM.cookies = {

	get: function(key) {
		var name = "TouchUI." + key + "=";
		var ca = document.cookie.split(';');
		for(var i=0; i<ca.length; i++) {
			var c = ca[i];
			while (c.charAt(0)==' ') c = c.substring(1);
			if (c.indexOf(name) == 0) return $.parseJSON(c.substring(name.length,c.length));
		}
		return undefined;
	},

	set: function(key, value) {
		var d = new Date();
		d.setTime(d.getTime()+(360*24*60*60*1000));
		var expires = "expires="+d.toUTCString();
		document.cookie = "TouchUI." + key + "=" + value + "; " + expires;
	},

	toggleBoolean: function(key) {
		var value = $.parseJSON(this.get(key) || "false");

		if(value === true) {
			this.set(key, "false");
		} else {
			this.set(key, "true");
		}

		return !value;

	}

}

TouchUI.prototype.DOM.localstorage = {
	store: JSON.parse(localStorage["TouchUI"] || "{}"),

	get: function (key) {
		return this.store[key];
	},

	set: function (key, value) {
		this.store[key] = value;
		localStorage["TouchUI"] = JSON.stringify(this.store);
		return this.store[key];
	},

	toggleBoolean: function (key) {
		var value = this.store[key] || false;

		if(value === true) {
			this.set(key, false);
		} else {
			this.set(key, true);
		}

		return !value;

	}

}

// Since I messed up by releasing start_kweb3.xinit without disabling private
// mode, we now need to check if we can store anything at all in localstorage
// the missing -P will prevent any localstorage
if (TouchUI.prototype.settings.hasLocalStorage) {
	try {
		localStorage["TouchUIcanWeHazStorage"] = "true";
		TouchUI.prototype.DOM.storage = TouchUI.prototype.DOM.localstorage;
		delete localStorage["TouchUIcanWeHazStorage"];
	} catch(err) {

		// TODO: remove this is future
		if(TouchUI.prototype.settings.isEpiphanyOrKweb) {
			$(function() {
				new PNotify({
					type: 'error',
					title: "Private Mode detection:",
					text: "Edit the startup file 'start_kweb3.xinit' in '~/OctoPrint-TouchUI-autostart/' "+
						"and add the parameter 'P' after the dash. \n\n" +
						"For more information see the v0.3.3 release notes.",
					hide: false
				});
			});
		}

		console.info("Localstorage defined but failback to cookies due to errors.");
		TouchUI.prototype.DOM.storage = TouchUI.prototype.DOM.cookies;
	}
} else {
	TouchUI.prototype.DOM.storage = TouchUI.prototype.DOM.cookies;
}

TouchUI.prototype.DOM.storage.migration = (TouchUI.prototype.DOM.storage === TouchUI.prototype.DOM.localstorage) ? function migration() {

	if (this.settings.hasLocalStorage) {
		if (document.cookie.indexOf("TouchUI.") !== -1) {
			console.info("TouchUI cookies migration.");

			var name = "TouchUI.";
			var ca = document.cookie.split(';');
			for (var i=0; i<ca.length; i++) {
				var c = ca[i];
				while (c.charAt(0)==' ') c = c.substring(1);
				if (c.indexOf(name) == 0) {
					var string = c.substring(name.length,c.length);
					string = string.split("=");
					var value = $.parseJSON(string[1]);

					console.info("Saving cookie", string[0], "with value", value, "to localstorage.");
					this.DOM.storage.set(string[0], value);

					console.info("Removing cookie", string[0]);
					document.cookie = "TouchUI." + string[0] + "=; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
				}
			}
		}
	}

} : _.noop;

TouchUI.prototype.knockout.bindings = function() {
	var self = this;

	this.bindings = {

		toggleTouch: function() {
			if (self.DOM.storage.toggleBoolean("active")) {
				document.location.hash = "#touch";
			} else {
				document.location.hash = "";
			}
			document.location.reload();
		},

		toggleKeyboard: function() {
			if (self.isActive()) {
				self.components.keyboard.isActive(self.DOM.storage.toggleBoolean("keyboardActive"));
			}
		},

		toggleHidebar: function() {
			if (self.isActive()) {
				self.animate.isHidebarActive(self.DOM.storage.toggleBoolean("hideNavbarActive"));
			}
		},

		toggleFullscreen: function() {
			$(document).toggleFullScreen();
		},

		toggleTouchscreen: function() {
			if (self.isActive()) {
				self.settings.isTouchscreen(self.DOM.storage.toggleBoolean("touchscreenActive"));
				document.location.reload();
			}
		},

		show: function() {
			self.settings.touchuiModal.modal("show");
		}

	}

}

TouchUI.prototype.knockout.isLoading = function (viewModels) {
	var self = this;

	if(self.isActive()) {
		self.components.touchscreen.isLoading.call(self, viewModels);

		// Prevent user from double clicking in a short period on buttons
		$(document).on("click", "button:not(.box, .distance, .dropdown-toggle)", function(e) {
			var printer = $(e.target);
			printer.prop('disabled', true);

			setTimeout(function() {
				printer.prop('disabled', false);
			}, 600);
		});

		// Update scroll area if new items arrived
		if( !self.settings.hasTouch ) {
			viewModels.gcodeFilesViewModel.listHelper.paginatedItems.subscribe(function(a) {
				setTimeout(function() {
					self.scroll.iScrolls.body.refresh();
				}, 300);
			});
		}

		// Watch the operational binder for visual online/offline
		viewModels.connectionViewModel.isOperational.subscribe(function(newOperationalState) {
			var printLink = $("#all_touchui_settings");
			if( !newOperationalState ) {
				printLink.addClass("offline").removeClass("online");
				$("#conn_link2").addClass("offline").removeClass("online");
			} else {
				printLink.removeClass("offline").addClass("online");
				$("#conn_link2").removeClass("offline").addClass("online");
			}
		});
	}

	// Check if we can show whats new in this version
	self.settings.whatsNew.subscribe(function(whatsNew) {
		if(whatsNew !== false && whatsNew.trim() != "") {
			new PNotify({
				title: 'TouchUI: What\'s new?',
				text: whatsNew,
				icon: 'glyphicon glyphicon-question-sign',
				type: 'info',
				hide: false
			});
		}
	});

}

TouchUI.prototype.knockout.isReady = function (viewModels) {
	var self = this;

	if(self.isActive()) {
		// Repaint graph after resize (.e.g orientation changed)
		$(window).on("resize", function() {
			viewModels.temperatureViewModel.updatePlot();
		});

		// Remove slimScroll from files list
		$('.gcode_files').slimScroll({destroy: true});
		$('.slimScrollDiv').slimScroll({destroy: true});

		// Remove active keyboard when disabled
		self.components.keyboard.isActive.subscribe(function(isActive) {
			if( !isActive ) {
				$(".ui-keyboard-input").each(function(ind, elm) {
					$(elm).data("keyboard").destroy();
				});
			}
		});

		// Remove drag files into website feature
		$(document).off("dragover");
		if(viewModels.gcodeFilesViewModel._enableDragNDrop) {
			viewModels.gcodeFilesViewModel._enableDragNDrop = function() {};
		}

		// Hide the dropdown after login
		viewModels.settingsViewModel.loginState.loggedIn.subscribe(function(isLoggedIn) {
			if(isLoggedIn && $(".open > .dropdown-menu").length > 0) {
				$(document).trigger("click");
			}
		});

		// Redo scroll-to-end interface
		$("#term .terminal small.pull-right").html('<a href="#"><i class="fa fa-angle-double-down"></i></a>').on("click", function() {
			viewModels.terminalViewModel.scrollToEnd();
			return false;
		});

		// Resize height of low-fi terminal to enable scrolling
		if($("#terminal-output-lowfi").prop("scrollHeight")) {
			viewModels.terminalViewModel.plainLogOutput.subscribe(function() {
				$("#terminal-output-lowfi").height($("#terminal-output-lowfi").prop("scrollHeight"));
			});
		}

		// Overwrite terminal knockout functions (i.e. scroll to end)
		this.scroll.overwrite.call(this, viewModels.terminalViewModel);

		// Setup version tracking in terminal
		this.core.version.init.call(this, viewModels.softwareUpdateViewModel);

		// (Re-)Apply bindings to the new webcam div
		if($("#webcam").length) {
			ko.applyBindings(viewModels.controlViewModel, $("#webcam")[0]);
		}

		// (Re-)Apply bindings to the new navigation div
		if($("#navbar_login").length) {
			try {
				ko.applyBindings(viewModels.navigationViewModel, $("#navbar_login")[0]);
			} catch(err) {}

			// Force the dropdown to appear open when logedIn
			viewModels.navigationViewModel.loginState.loggedIn.subscribe(function(loggedIn) {
				if( loggedIn ) {
					$('#navbar_login a.dropdown-toggle').addClass("hidden_touch");
					$('#login_dropdown_loggedin').removeClass('hide dropdown open').addClass('visible_touch');
				} else {
					$('#navbar_login a.dropdown-toggle').removeClass("hidden_touch");
					$('#login_dropdown_loggedin').removeClass('visible_touch');
				}

				// Refresh scroll view when login state changed
				if( !self.settings.hasTouch ) {
					setTimeout(function() {
						self.scroll.currentActive.refresh();
					}, 0);
				}
			});
		}

		// (Re-)Apply bindings to the new system commands div
		if($("#navbar_systemmenu").length) {
			ko.applyBindings(viewModels.navigationViewModel, $("#navbar_systemmenu")[0]);
			ko.applyBindings(viewModels.navigationViewModel, $("#divider_systemmenu")[0]);
		}

		// Force knockout to read the change
		$('.colorPicker').tinycolorpicker().on("change", function(e, hex, rgb, isTriggered) {
			if(isTriggered !== false) {
				$(this).find("input").trigger("change", [hex, rgb, false]);
			}
		});

		// Reuse for code below
		var refreshUrl = function(href) {
			return href.split("?")[0] + "?ts=" + new Date().getMilliseconds();
		}

		// Reload CSS if needed
		self.settings.refreshCSS.subscribe(function(hasRefresh) {
			if (hasRefresh || hasRefresh === "fast") {
				// Wait 2 seconds, so we're not too early
				setTimeout(function() {
					var $css = $("#touchui-css");
					$css.attr("href", refreshUrl($css.attr("href")));
					self.settings.refreshCSS(false);
				}, (hasRefresh === "fast") ? 0 : 1200);
			}
		});

		// Reload CSS or LESS after saving our settings
		self.settings.hasCustom.subscribe(function(customCSS) {
			if(customCSS !== "") {
				var $css = $("#touchui-css");
				var href = $css.attr("href");

				if(customCSS) {
					href = href.replace("touchui.css", "touchui.custom.css");
				} else {
					href = href.replace("touchui.custom.css", "touchui.css");
				}

				$css.attr("href", refreshUrl(href));
			}
		});
	}

	// Check if we need to update an old LESS file with a new LESS one
	var requireNewCSS = ko.computed(function() {
		return self.settings.requireNewCSS() && viewModels.loginStateViewModel.isAdmin();
	});
	requireNewCSS.subscribe(function(requireNewCSS) {
		if(requireNewCSS) {
			setTimeout(function() {
				self.core.less.save.call(self, self);
			}, 100);
		}
	});

}

TouchUI.prototype.knockout.viewModel = function() {
	var self = this;

	// Subscribe to OctoPrint events
	self.onStartupComplete = function () {
		if (self.isActive()) {
			self.DOM.overwrite.tabbar.call(self);
		}
		self.knockout.isReady.call(self, self.core.bridge.allViewModels);
		if (self.isActive()) {
			self.plugins.init.call(self, self.core.bridge.allViewModels);
		}
	}

	self.onBeforeBinding = function() {
		ko.mapping.fromJS(self.core.bridge.allViewModels.settingsViewModel.settings.plugins.touchui, {}, self.settings);
	}

	self.onSettingsBeforeSave = function() {
		self.core.less.save.call(self);
	}

	self.onTabChange = function() {
		if (self.isActive()) {
			self.animate.hide.call(self, "navbar");

			if(!self.settings.hasTouch && self.scroll.currentActive) {
				self.scroll.currentActive.refresh();
				setTimeout(function() {
					self.scroll.currentActive.refresh();
				}, 0);
			}
		}
	}

}

TouchUI.prototype.plugins.init = function (viewModels) {
	this.plugins.screenSquish(viewModels.pluginManagerViewModel);
}

TouchUI.prototype.plugins.navbarTemp = function() {

	// Manually move navbar temp (hard move)
	if( $("#navbar_plugin_navbartemp").length > 0 ) {
		var navBarTmp = $("#navbar_plugin_navbartemp").appendTo(this.DOM.create.dropdown.container);
		$('<li class="divider"></li>').insertBefore(navBarTmp);
	}

}

TouchUI.prototype.plugins.screenSquish = function(pluginManagerViewModel) {
	var shown = false;

	pluginManagerViewModel.plugins.items.subscribe(function() {

		var ScreenSquish = pluginManagerViewModel.plugins.getItem(function(elm) {
			return (elm.key === "ScreenSquish");
		}, true) || false;

		if(!shown && ScreenSquish && ScreenSquish.enabled) {
			shown = true;
			new PNotify({
				title: 'TouchUI: ScreenSquish is running',
				text: 'Running ScreenSquish and TouchUI will give issues since both plugins try the same, we recommend turning off ScreenSquish.',
				icon: 'glyphicon glyphicon-question-sign',
				type: 'error',
				hide: false,
				confirm: {
					confirm: true,
					buttons: [{
						text: 'Disable ScreenSquish',
						addClass: 'btn-primary',
						click: function(notice) {
							if(!ScreenSquish.pending_disable) {
								pluginManagerViewModel.togglePlugin(ScreenSquish);
							}
							notice.remove();
						}
					}]
				},
			});
		}

	});

};

TouchUI.prototype.scroll.beforeLoad = function() {

	// Manipulate DOM for iScroll before knockout binding kicks in
	if (!this.settings.hasTouch) {
		$('<div id="scroll"></div>').insertBefore('.page-container');
		$('.page-container').appendTo("#scroll");
	}

}

TouchUI.prototype.scroll.init = function() {
	var self = this;

	if ( this.settings.hasTouch ) {
		var width = $(window).width();

		// Covert VH to the initial height (prevent height from jumping when navigation bar hides/shows)
		$("#temperature-graph").parent().height($("#temperature-graph").parent().outerHeight());
		$("#terminal-scroll").height($("#terminal-scroll").outerHeight());
		$("#terminal-sendpanel").css("top", $("#terminal-scroll").outerHeight()-1);

		$(window).on("resize", function() {

			if(width !== $(window).width()) {
				$("#temperature-graph").parent().height($("#temperature-graph").parent().outerHeight());
				$("#terminal-scroll").css("height", "").height($("#terminal-scroll").outerHeight());
				$("#terminal-sendpanel").css("top", $("#terminal-scroll").outerHeight()-1);
				width = $(window).width();
			}


		});

	} else {

		// Set overflow hidden for best performance
		$("html").addClass("emulateTouch");

		self.scroll.terminal.init.call(self);
		self.scroll.body.init.call(self);
		self.scroll.modal.init.call(self);
		self.scroll.overlay.init.call(self);

		$(document).on("slideCompleted", function() {
			self.scroll.currentActive.refresh();
		});

		// Refresh body on dropdown click
		$(document).on("click", ".pagination ul li a", function() {
			setTimeout(function() {
				self.scroll.currentActive.refresh();
			}, 0);
		});

	}

}

TouchUI.prototype.scroll.blockEvents = {
	className: "no-pointer",

	scrollStart: function($elm, iScrollInstance) {
		$elm.addClass(this.className);
	},

	scrollEnd: function($elm, iScrollInstance) {
		$elm.removeClass(this.className);
		iScrollInstance.refresh();
	}

}

TouchUI.prototype.scroll.body = {

	init: function() {
		var self = this;
		var scrollStart = false;
		var $noPointer = $('.page-container');

		// Create main body scroll
		self.scroll.iScrolls.body = new IScroll("#scroll", self.scroll.defaults.iScroll);
		self.scroll.currentActive = self.scroll.iScrolls.body;

		// Block everthing while scrolling
		var scrollStart = self.scroll.blockEvents.scrollStart.bind(self.scroll.blockEvents, $noPointer, self.scroll.iScrolls.body),
			scrollEnd = self.scroll.blockEvents.scrollEnd.bind(self.scroll.blockEvents, $noPointer, self.scroll.iScrolls.body);

		// Disable all JS events while scrolling for best performance
		self.scroll.iScrolls.body.on("scrollStart", scrollStart);
		self.scroll.iScrolls.body.on("onBeforeScrollStart", scrollStart);
		self.scroll.iScrolls.body.on("scrollEnd", scrollEnd);
		self.scroll.iScrolls.body.on("scrollCancel", scrollEnd);

		// Prevent any misfortune
		$(document).on("mouseup.prevent.pointer touchend.prevent.pointer", function() {
			$noPointer.removeClass('no-pointer');
		});

	}

}

TouchUI.prototype.scroll.modal = {
	stack: [],
	dropdown: null,

	init: function() {
		var $document = $(document),
			self = this;

		$document.on("modal.touchui", function(e, elm) {
			var $modalElm = $(elm),
				$modalContainer = $(elm).parent();

			// Create temp iScroll within the modal
			var curModal = new IScroll($modalContainer[0], self.scroll.defaults.iScroll);

			// Store into stack
			self.scroll.modal.stack.push(curModal);
			self.scroll.currentActive = curModal;

			// Force iScroll to get the correct scrollHeight
			setTimeout(function() {
				if(curModal) {
					curModal.refresh();
				}
			}, 0);
			// And Refresh again after animation
			setTimeout(function() {
				if(curModal) {
					curModal.refresh();
				}
			}, 800);

			// Store bindings into variable for future reference
			var scrollStart = self.scroll.blockEvents.scrollStart.bind(self.scroll.blockEvents, $modalElm, curModal),
				scrollEnd = self.scroll.blockEvents.scrollEnd.bind(self.scroll.blockEvents, $modalElm, curModal);

			// Disable all JS events while scrolling for best performance
			curModal.on("scrollStart", scrollStart);
			curModal.on("scrollEnd", scrollEnd);
			curModal.on("scrollCancel", scrollEnd);

			// Refresh the scrollHeight and scroll back to top with these actions:
			$document.on("click.scrollHeightTouchUI", '[data-toggle="tab"], .pagination ul li a', function(e) {
				curModal._end(e);

				setTimeout(function() {
					curModal.refresh();
					curModal.scrollTo(0, 0);
				}, 0);
			});

			// Kill it with fire!
			$modalElm.one("destroy", function() {
				$document.off("click.scrollHeightTouchUI");
				self.scroll.modal.stack.pop();

				if(self.scroll.modal.stack.length > 0) {
					self.scroll.currentActive = self.scroll.modal.stack[self.scroll.modal.stack.length-1];
				} else {
					self.scroll.currentActive = self.scroll.iScrolls.body;
				}

				curModal.destroy();
				curModal.off("scrollStart", scrollStart);
				curModal.off("scrollEnd", scrollEnd);
				curModal.off("scrollCancel", scrollEnd);
				curModal = undefined;
			});

		});

		// Triggered when we create the dropdown and need scrolling
		$document.on("dropdown-open.touchui", function(e, elm) {
			var $elm = $(elm);

			// Create dropdown scroll
			self.scroll.modal.dropdown = new IScroll(elm, {
				scrollbars: true,
				mouseWheel: true,
				interactiveScrollbars: true,
				shrinkScrollbars: "scale"
			});

			// Set scroll to active item
			self.scroll.modal.dropdown.scrollToElement($elm.find('li.active')[0], 0, 0, -30);

			// Disable scrolling in active modal
			self.scroll.modal.stack[self.scroll.modal.stack.length-1].disable();

			// Store bindings into variable for future reference
			var scrollStart = self.scroll.blockEvents.scrollStart.bind(self.scroll.blockEvents, $elm, self.scroll.modal.dropdown),
				scrollEnd = self.scroll.blockEvents.scrollEnd.bind(self.scroll.blockEvents, $elm, self.scroll.modal.dropdown);

			// Disable all JS events for smooth scrolling
			self.scroll.modal.dropdown.on("scrollStart", scrollStart);
			self.scroll.modal.dropdown.on("scrollEnd", scrollEnd);
			self.scroll.modal.dropdown.on("scrollCancel", scrollEnd);

			$document.on("dropdown-closed.touchui", function() {
				// Enable active modal
				self.scroll.modal.stack[self.scroll.modal.stack.length-1].enable();

				self.scroll.modal.dropdown.off("scrollStart", scrollStart);
				self.scroll.modal.dropdown.off("scrollEnd", scrollEnd);
				self.scroll.modal.dropdown.off("scrollCancel", scrollEnd);
			});

		});

	}
}

TouchUI.prototype.scroll.overlay = {

	mainItems: ['#offline_overlay', '#reloadui_overlay'],
	init: function() {
		var self = this;

		self.scroll.iScrolls.overlay = [];

		$items = $(this.scroll.overlay.mainItems);
		$items.each(function(ind, elm) {
			var child = $(elm).children("#" + $(elm).attr("id") + "_wrapper");
			var div = $('<div></div>').prependTo(elm);
			child.appendTo(div);

			$(elm).addClass("iscroll");

			self.scroll.iScrolls.overlay[ind] = new IScroll(elm, self.scroll.defaults.iScroll);
		});

	},

	refresh: function() {
		var self = this;

		setTimeout(function() {
			$.each(self.scroll.iScrolls.overlay, function(ind) {
				self.scroll.iScrolls.overlay[ind].refresh();
			});
		}, 0);

	}

}

TouchUI.prototype.scroll.overwrite = function(terminalViewModel) {
	var self = this;

	if ( !this.settings.hasTouch ) {

		// Enforce no scroll jumping
		$("#scroll").on("scroll", function() {
			if($("#scroll").scrollTop() !== 0) {
				$("#scroll").scrollTop(0);
			}
		});

		// Refresh terminal scroll height
		terminalViewModel.displayedLines.subscribe(function() {
			self.scroll.iScrolls.terminal.refresh();
		});

		// Overwrite scrollToEnd function with iScroll functions
		terminalViewModel.scrollToEnd = function() {
			self.scroll.iScrolls.terminal.refresh();
			self.scroll.iScrolls.terminal.scrollTo(0, self.scroll.iScrolls.terminal.maxScrollY);
		};

		// Overwrite orginal helper, add one step and call the orginal function
		var showOfflineOverlay = window.showOfflineOverlay;
		window.showOfflineOverlay = function(title, message, reconnectCallback) {
			showOfflineOverlay.call(this, title, message, reconnectCallback);
			self.scroll.overlay.refresh.call(self);
		};

		// Overwrite orginal helper, add one step and call the orginal function
		var showConfirmationDialog = window.showConfirmationDialog;
		window.showConfirmationDialog = function(message, onacknowledge) {
			self.scroll.iScrolls.body.scrollTo(0, 0, 500);
			showConfirmationDialog.call(this, message, onacknowledge);
		};

		// Overwrite orginal helper, add one step and call the orginal function
		var showReloadOverlay = $.fn.show;
		$.fn.show = function(e,r,i) {
			if($(this).hasClass("iscroll")) {
				setTimeout(function() {
					self.scroll.overlay.refresh.call(self);
				}, 0);
			}

			return showReloadOverlay.call(this,e,r,i);
		}

	} else {

		// Overwrite scrollToEnd function with #terminal-scroll as scroller
		terminalViewModel.scrollToEnd = function() {
			var $container = $("#terminal-scroll");
			if ($container.length) {
				$container.scrollTop($container[0].scrollHeight - $container.height())
			}
		}

	}
}

TouchUI.prototype.scroll.terminal = {

	init: function() {
		var self = this;

		// Create scrolling for terminal
		self.scroll.iScrolls.terminal = new IScroll("#terminal-scroll", self.scroll.defaults.iScroll);

		// Enforce the right scrollheight and disable main scrolling if we have a scrolling content
		self.scroll.iScrolls.terminal.on("beforeScrollStart", function() {
			self.scroll.iScrolls.terminal.refresh();

			if(this.hasVerticalScroll) {
				self.scroll.iScrolls.body.disable();
			}
		});
		self.scroll.iScrolls.terminal.on("scrollEnd", function() {
			self.scroll.iScrolls.body.enable();
		});

	}
}

TouchUI.prototype.DOM.create.dropdown = {

	menuItem: {
		cloneTo: $('#navbar ul.nav')
	},
	container: null,

	init: function() {

		this.menuItem.menu = $('' +
			'<li id="all_touchui_settings" class="dropdown">' +
				'<a href="#" class="dropdown-toggle" data-toggle="dropdown">' +
					$('navbar_show_settings').text() +
				'</a>' +
			'</li>').prependTo(this.menuItem.cloneTo);

		this.container = $('<ul class="dropdown-menu"></ul>').appendTo(this.menuItem.menu);
	}

}

TouchUI.prototype.DOM.create.printer = {

	menu: {
		cloneTo: "#tabs"
	},

	container: {
		cloneTo: "#temp"
	},

	move: {
		$state: $("#state_wrapper"),
		$files: $("#files_wrapper")
	},

	init: function( tabbar ) {
		this.menu.$elm = tabbar.createItem("print_link", "printer", "tab").prependTo(this.menu.cloneTo);
		this.container.$elm = $('<div id="printer" class="tab-pane active"><div class="row-fluid"></div></div>').insertBefore(this.container.cloneTo);

		// Move the contents of the hidden accordions to the new print status and files tab
		this.move.$state.appendTo(this.container.$elm.find(".row-fluid"));
		this.move.$files.insertAfter(this.container.$elm.find(".row-fluid #state_wrapper"));
	}

}

TouchUI.prototype.DOM.create.tabbar = {

	createItem: function(itemId, linkId, toggle, text) {
		text = (text) ? text : "";
		return $('<li id="'+itemId+'"><a href="#'+linkId+'" data-toggle="'+toggle+'">'+text+'</a></li>');

	}
}

TouchUI.prototype.DOM.create.webcam = {

	menu: {
		webcam: {
			cloneTo: "#term_link"
		}
	},

	container: {
		cloneTo: ".tab-content",

		webcam: {
			$container: $("#webcam_container"),
			cloneTo: "#webcam"
		}
	},

	init: function( tabbar ) {
		var self = this;

		this.container.$elm = $('<div id="webcam" class="tab-pane"></div>').appendTo(this.container.cloneTo);
		this.menu.webcam.$elm = tabbar.createItem("webcam_link", "webcam", "tab").insertBefore(this.menu.webcam.cloneTo);

		this.container.webcam.$container.next().appendTo(this.container.webcam.cloneTo);
		this.container.webcam.$container.prependTo(this.container.webcam.cloneTo);

		$('<!-- ko allowBindings: false -->').insertBefore(this.container.$elm);
		$('<!-- /ko -->').insertAfter(this.container.$elm);

		$("#webcam_container").attr("data-bind", $("#webcam_container").attr("data-bind").replace("keydown: onKeyDown, ", ""));

	}

}

TouchUI.prototype.DOM.move.afterTabAndNav = function() {

	this.DOM.create.dropdown.container.children().each(function(ind, elm) {
		var $elm = $(elm);
		$('<!-- ko allowBindings: false -->').insertBefore($elm);
		$('<!-- /ko -->').insertAfter($elm);
	});

	//Add hr before the settings icon
	$('<li class="divider"></li>').insertBefore("#navbar_settings");
	$('<li class="divider" id="divider_systemmenu" style="display: none;"></li>').insertBefore("#navbar_systemmenu").attr("data-bind", $("#navbar_systemmenu").attr("data-bind"));

}

TouchUI.prototype.DOM.move.connection = {
	$container: null,
	containerId: "connection_dialog",
	$cloneContainer: $("#usersettings_dialog"),
	$cloneModal: $("#connection_wrapper"),
	cloneTo: "#all_touchui_settings > ul",

	init: function( tabbar ) {
		var text = this.$cloneModal.find(".accordion-heading").text().trim();

		// Clone usersettings modal
		this.$container = this.$cloneContainer.clone().attr("id", this.containerId).insertAfter(this.$cloneContainer);
		this.$containerBody = this.$container.find(".modal-body");

		// Remove all html from clone
		this.$containerBody.html("");

		// Append tab contents to modal
		this.$cloneModal.appendTo(this.$containerBody);

		// Set modal header to accordion header
		this.$container.find(".modal-header h3").text(text);

		// Create a link in the dropdown
		this.$menuItem = tabbar.createItem("conn_link2", this.containerId, "modal", text)
			.attr("data-bind", "visible: loginState.isAdmin")
			.prependTo(this.cloneTo);
	}
}

TouchUI.prototype.DOM.move.controls = {

	init: function() {

		// backward compatibility with <1.3.0
		if($('#control-jog-feedrate').length === 0) {
			var jogPanels = $('#control > .jog-panel');

			$(jogPanels[0]).find(".jog-panel:nth-child(1)").attr("id", "control-jog-xy");
			$(jogPanels[0]).find(".jog-panel:nth-child(2)").attr("id", "control-jog-z");
			$(jogPanels[1]).attr("id", "control-jog-extrusion");
			$(jogPanels[2]).attr("id", "control-jog-general");

			$('<div class="jog-panel" id="control-jog-feedrate"></div>').insertAfter($(jogPanels[2]));
			$(jogPanels[0]).find("> button:last-child").prependTo("#control-jog-feedrate");
			$(jogPanels[0]).find("> input:last-child").prependTo("#control-jog-feedrate");
			$(jogPanels[0]).find("> .slider:last-child").prependTo("#control-jog-feedrate");

		}

		$("#control-jog-feedrate").attr("data-bind", $("#control-jog-extrusion").data("bind")).insertAfter("#control-jog-extrusion");
		$("#control-jog-extrusion button:last-child").prependTo("#control-jog-feedrate");
		$("#control-jog-extrusion input:last-child").prependTo("#control-jog-feedrate");
		$("#control-jog-extrusion .slider:last-child").prependTo("#control-jog-feedrate");

		$("#control div.distance").prependTo("#control-jog-feedrate");
		$("#control-jog-feedrate").insertBefore("#control-jog-extrusion");

	}

}

TouchUI.prototype.DOM.move.navbar = {
	mainItems: ['#all_touchui_settings', '#navbar_plugin_navbartemp', '#navbar_login', /*'#navbar_systemmenu',*/ '.hidden_touch'],
	init: function() {

		$items = $("#navbar ul.nav > li:not("+this.DOM.move.navbar.mainItems+")");
		$items.each(function(ind, elm) {
			var $elm = $(elm);
			$elm.appendTo(this.DOM.create.dropdown.container);
			$elm.find('a').text($elm.text().trim());
		}.bind(this));

		// Move TouchUI to main dropdown
		$("#navbar_plugin_touchui").insertAfter("#navbar_settings");

		// Create and Move login form to main dropdown
		$('<li><ul id="youcanhazlogin"></ul></li>').insertAfter("#navbar_plugin_touchui");
		$('#navbar_login').appendTo('#youcanhazlogin').find('a.dropdown-toggle').text($('#youcanhazlogin').find('a.dropdown-toggle').text().trim());

		// Move the navbar temp plugin
		this.plugins.navbarTemp.call(this);

	}

}

TouchUI.prototype.DOM.move.overlays = {

	mainItems: ['#offline_overlay', '#reloadui_overlay', '#drop_overlay'],
	init: function() {

		$(this.DOM.move.overlays.mainItems).each(function(ind, elm) {
			var $elm = $(elm);
			$elm.appendTo('body');
		}.bind(this));

	}

}

TouchUI.prototype.DOM.move.tabbar = {
	mainItems: ['#print_link', '#temp_link', '#control_link', '#webcam_link', '#term_link', '.hidden_touch'],
	init: function() {

		$items = $("#tabs > li:not("+this.DOM.move.tabbar.mainItems+")");
		$items.each(function(ind, elm) {
			var $elm = $(elm);

			// Clone the items into the dropdown, and make it click the orginal link
			$elm.clone().attr("id", $elm.attr("id")+"2").appendTo("#all_touchui_settings .dropdown-menu").find('a').off("click").on("click", function(e) {
				$elm.find('a').click();
				$("#all_touchui_settings").addClass("item_active");
				e.preventDefault();
				return false;
			});
			$elm.addClass("hidden_touch");

		}.bind(this));

		$items = $("#tabs > li > a");
		$items.each(function(ind, elm) {
			$(elm).text("");
		}.bind(this));

	}
}

TouchUI.prototype.DOM.move.terminal = {

	init: function() {

		// Add version number placeholder
		$('<span></span>').prependTo("#terminal-output");

		// Create iScroll container for terminal
		var container = $('<div id="terminal-scroll"></div>').insertBefore("#terminal-output");
		var inner = $('<div id="terminal-scroll-inner"></div>').appendTo(container);
		$("#terminal-output").appendTo(inner);
		$("#terminal-output-lowfi").appendTo(inner);

	}

};

TouchUI.prototype.DOM.overwrite.modal = function() {

	//We need a reliable event for catching new modals for attaching a scrolling bar
	$.fn.modalBup = $.fn.modal;
	$.fn.modal = function(options, args) {
		// Update any other modifications made by others (i.e. OctoPrint itself)
		$.fn.modalBup.defaults = $.fn.modal.defaults;

		// Create modal, store into variable so we can trigger an event first before return
		var tmp = $(this).modalBup(options, args);
		$(this).trigger("modal.touchui", this);
		return tmp;
	};
	$.fn.modal.prototype = { constructor: $.fn.modal };
	$.fn.modal.Constructor = $.fn.modal;
	$.fn.modal.defaults = $.fn.modalBup.defaults;

}

TouchUI.prototype.DOM.overwrite.tabbar = function() {

	// Force the webcam tab to load the webcam feed that original is located on the controls tab
	$('#tabs [data-toggle=tab]').each(function(ind, elm) {

		// Get the currently attached events to the toggle
		var events = $.extend([], jQuery._data(elm, "events").show),
			$elm = $(elm);

		// Remove all previous set events and call them after manipulating a few things
		$elm.off("show").on("show", function(e) {
			var scope = this,
				current = e.target.hash,
				previous = e.relatedTarget.hash;

			current = (current === "#control") ? "#control_without_webcam" : current;
			current = (current === "#webcam") ? "#control" : current;

			previous = (previous === "#control") ? "#control_without_webcam" : previous;
			previous = (previous === "#webcam") ? "#control" : previous;

			// Call previous unset functions (e.g. let's trigger the event onTabChange in all the viewModels)
			$.each(events, function(key, event) {
				event.handler.call(scope, {
					target: {
						hash: current
					},
					relatedTarget: {
						hash: previous
					}
				});
			});
		})
	});

}

TouchUI.prototype.DOM.overwrite.tabdrop = function() {
	$.fn.tabdrop = function() {};
	$.fn.tabdrop.prototype = { constructor: $.fn.tabdrop };
	$.fn.tabdrop.Constructor = $.fn.tabdrop;
}

;

!function(){var E=new TouchUI;E.domLoading(),$(function(){E.domReady(),OCTOPRINT_VIEWMODELS.push([E.koStartup,E.TOUCHUI_REQUIRED_VIEWMODELS,E.TOUCHUI_ELEMENTS,E.TOUCHUI_REQUIRED_VIEWMODELS])})}();
;

$(function() {
    function AnnouncementsViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];

        self.channels = new ItemListHelper(
            "plugin.announcements.channels",
            {
                "channel": function (a, b) {
                    // sorts ascending
                    if (a["channel"].toLocaleLowerCase() < b["channel"].toLocaleLowerCase()) return -1;
                    if (a["channel"].toLocaleLowerCase() > b["channel"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            5
        );

        self.unread = ko.observable();
        self.hiddenChannels = [];
        self.channelNotifications = {};

        self.announcementDialog = undefined;
        self.announcementDialogContent = undefined;
        self.announcementDialogTabs = undefined;

        self.setupTabLink = function(item) {
            $("a[data-toggle='tab']", item).on("show", self.resetContentScroll);
        };

        self.resetContentScroll = function() {
            self.announcementDialogContent.scrollTop(0);
        };

        self.toggleButtonCss = function(data) {
            var icon = data.enabled ? "icon-circle" : "icon-circle-blank";
            var disabled = (self.enableToggle(data)) ? "" : " disabled";

            return icon + disabled;
        };

        self.toggleButtonTitle = function(data) {
            return data.forced ? gettext("Cannot be toggled") : (data.enabled ? gettext("Disable Channel") : gettext("Enable Channel"));
        };

        self.enableToggle = function(data) {
            return !data.forced;
        };

        self.markRead = function(channel, until) {
            if (!self.loginState.isAdmin()) return;

            var url = PLUGIN_BASEURL + "announcements/channels/" + channel;

            var payload = {
                command: "read",
                until: until
            };

            $.ajax({
                url: url,
                type: "POST",
                dataType: "json",
                data: JSON.stringify(payload),
                contentType: "application/json; charset=UTF-8",
                success: function() {
                    self.retrieveData()
                }
            })
        };

        self.toggleChannel = function(channel) {
            if (!self.loginState.isAdmin()) return;

            var url = PLUGIN_BASEURL + "announcements/channels/" + channel;

            var payload = {
                command: "toggle"
            };

            $.ajax({
                url: url,
                type: "POST",
                dataType: "json",
                data: JSON.stringify(payload),
                contentType: "application/json; charset=UTF-8",
                success: function() {
                    self.retrieveData()
                }
            })
        };

        self.refreshAnnouncements = function() {
            self.retrieveData(true);
        };

        self.retrieveData = function(force) {
            if (!self.loginState.isAdmin()) return;

            var url = PLUGIN_BASEURL + "announcements/channels";
            if (force) {
                url += "?force=true";
            }

            $.ajax({
                url: url,
                type: "GET",
                dataType: "json",
                success: function(data) {
                    self.fromResponse(data);
                }
            });
        };

        self.fromResponse = function(data) {
            var currentTab = $("li.active a", self.announcementDialogTabs).attr("href");

            var unread = 0;
            var channels = [];
            _.each(data, function(value, key) {
                value.key = key;
                value.last = value.data.length ? value.data[0].published : undefined;
                value.count = value.data.length;
                unread += value.unread;
                channels.push(value);
            });
            self.channels.updateItems(channels);
            self.unread(unread);

            self.displayAnnouncements(channels);

            self.selectTab(currentTab);
        };

        self.showAnnouncementDialog = function(channel) {
            self.announcementDialogContent.scrollTop(0);

            if (!self.announcementDialog.hasClass("in")) {
                self.announcementDialog.modal({
                    minHeight: function() { return Math.max($.fn.modal.defaults.maxHeight() - 80, 250); }
                }).css({
                    width: 'auto',
                    'margin-left': function() { return -($(this).width() /2); }
                });
            }

            var tab = undefined;
            if (channel) {
                tab = "#plugin_announcements_dialog_channel_" + channel;
            }
            self.selectTab(tab);

            return false;
        };

        self.selectTab = function(tab) {
            if (tab != undefined) {
                if (!_.startsWith(tab, "#")) {
                    tab = "#" + tab;
                }
                $('a[href="' + tab + '"]', self.announcementDialogTabs).tab("show");
            } else {
                $('a:first', self.announcementDialogTabs).tab("show");
            }
        };

        self.displayAnnouncements = function(channels) {
            var displayLimit = self.settings.settings.plugins.announcements.display_limit();
            var maxLength = self.settings.settings.plugins.announcements.summary_limit();

            var cutAfterNewline = function(text) {
                text = text.trim();

                var firstNewlinePos = text.indexOf("\n");
                if (firstNewlinePos > 0) {
                    text = text.substr(0, firstNewlinePos).trim();
                }

                return text;
            };

            var stripParagraphs = function(text) {
                if (_.startsWith(text, "<p>")) {
                    text = text.substr("<p>".length);
                }
                if (_.endsWith(text, "</p>")) {
                    text = text.substr(0, text.length - "</p>".length);
                }

                return text.replace(/<\/p>\s*<p>/ig, "<br>");
            };

            _.each(channels, function(value) {
                var key = value.key;
                var channel = value.channel;
                var priority = value.priority;
                var items = value.data;

                if ($.inArray(key, self.hiddenChannels) > -1) {
                    // channel currently ignored
                    return;
                }

                var newItems = _.filter(items, function(entry) { return !entry.read; });
                if (newItems.length == 0) {
                    // no new items at all, we don't display anything for this channel
                    return;
                }

                var displayedItems;
                if (newItems.length > displayLimit) {
                    displayedItems = newItems.slice(0, displayLimit);
                } else {
                    displayedItems = newItems;
                }
                var rest = newItems.length - displayedItems.length;

                var text = "<ul>";
                _.each(displayedItems, function(item) {
                    var limitedSummary = stripParagraphs(item.summary_without_images.trim());
                    if (limitedSummary.length > maxLength) {
                        limitedSummary = limitedSummary.substr(0, maxLength);
                        limitedSummary = limitedSummary.substr(0, Math.min(limitedSummary.length, limitedSummary.lastIndexOf(" ")));
                        limitedSummary += "...";
                    }

                    text += "<li><a href='" + item.link + "' target='_blank' rel='noreferrer noopener'>" + cutAfterNewline(item.title) + "</a><br><small>" + formatTimeAgo(item.published) + "</small><p>" + limitedSummary + "</p></li>";
                });
                text += "</ul>";

                if (rest) {
                    text += gettext(_.sprintf("... and %(rest)d more.", {rest: rest}));
                }

                var options = {
                    title: channel,
                    text: text,
                    hide: false,
                    confirm: {
                        confirm: true,
                        buttons: [{
                            text: gettext("Later"),
                            click: function(notice) {
                                self.hiddenChannels.push(key);
                                notice.remove();
                            }
                        }, {
                            text: gettext("Mark read"),
                            click: function(notice) {
                                self.markRead(key, value.last);
                                notice.remove();
                            }
                        }, {
                            text: gettext("Read..."),
                            addClass: "btn-primary",
                            click: function(notice) {
                                self.showAnnouncementDialog(key);
                                self.markRead(key, value.last);
                                notice.remove();
                            }
                        }]
                    },
                    buttons: {
                        sticker: false,
                        closer: false
                    }
                };

                if (priority == 1) {
                    options.type = "error";
                }

                if (self.channelNotifications[key]) {
                    self.channelNotifications[key].remove();
                }
                self.channelNotifications[key] = new PNotify(options);
            });
        };

        self.onUserLoggedIn = function() {
            self.retrieveData();
        };

        self.onStartup = function() {
            self.announcementDialog = $("#plugin_announcements_dialog");
            self.announcementDialogContent = $("#plugin_announcements_dialog_content");
            self.announcementDialogTabs = $("#plugin_announcements_dialog_tabs");
        }
    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([
        AnnouncementsViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        ["#plugin_announcements_dialog", "#settings_plugin_announcements", "#navbar_plugin_announcements"]
    ]);
});

;

$(function() {
    function CuraViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];
        self.slicingViewModel = parameters[2];

        self.fileName = ko.observable();

        self.placeholderName = ko.observable();
        self.placeholderDisplayName = ko.observable();
        self.placeholderDescription = ko.observable();

        self.profileName = ko.observable();
        self.profileDisplayName = ko.observable();
        self.profileDescription = ko.observable();
        self.profileAllowOverwrite = ko.observable(true);

        self.uploadElement = $("#settings-cura-import");
        self.uploadButton = $("#settings-cura-import-start");

        self.profiles = new ItemListHelper(
            "plugin_cura_profiles",
            {
                "id": function(a, b) {
                    if (a["key"].toLocaleLowerCase() < b["key"].toLocaleLowerCase()) return -1;
                    if (a["key"].toLocaleLowerCase() > b["key"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "name": function(a, b) {
                    // sorts ascending
                    var aName = a.name();
                    if (aName === undefined) {
                        aName = "";
                    }
                    var bName = b.name();
                    if (bName === undefined) {
                        bName = "";
                    }

                    if (aName.toLocaleLowerCase() < bName.toLocaleLowerCase()) return -1;
                    if (aName.toLocaleLowerCase() > bName.toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "id",
            [],
            [],
            5
        );

        self._sanitize = function(name) {
            return name.replace(/[^a-zA-Z0-9\-_\.\(\) ]/g, "").replace(/ /g, "_");
        };

        self.uploadElement.fileupload({
            dataType: "json",
            maxNumberOfFiles: 1,
            autoUpload: false,
            add: function(e, data) {
                if (data.files.length == 0) {
                    return false;
                }

                self.fileName(data.files[0].name);

                var name = self.fileName().substr(0, self.fileName().lastIndexOf("."));
                self.placeholderName(self._sanitize(name).toLowerCase());
                self.placeholderDisplayName(name);
                self.placeholderDescription("Imported from " + self.fileName() + " on " + formatDate(new Date().getTime() / 1000));

                self.uploadButton.unbind("click");
                self.uploadButton.on("click", function() {
                    var form = {
                        allowOverwrite: self.profileAllowOverwrite()
                    };

                    if (self.profileName() !== undefined) {
                        form["name"] = self.profileName();
                    }
                    if (self.profileDisplayName() !== undefined) {
                        form["displayName"] = self.profileDisplayName();
                    }
                    if (self.profileDescription() !== undefined) {
                        form["description"] = self.profileDescription();
                    }

                    data.formData = form;
                    data.submit();
                });
            },
            done: function(e, data) {
                self.fileName(undefined);
                self.placeholderName(undefined);
                self.placeholderDisplayName(undefined);
                self.placeholderDescription(undefined);
                self.profileName(undefined);
                self.profileDisplayName(undefined);
                self.profileDescription(undefined);
                self.profileAllowOverwrite(true);

                $("#settings_plugin_cura_import").modal("hide");
                self.requestData();
                self.slicingViewModel.requestData();
            }
        });

        self.removeProfile = function(data) {
            if (!data.resource) {
                return;
            }

            self.profiles.removeItem(function(item) {
                return (item.key == data.key);
            });

            $.ajax({
                url: data.resource(),
                type: "DELETE",
                success: function() {
                    self.requestData();
                    self.slicingViewModel.requestData();
                }
            });
        };

        self.makeProfileDefault = function(data) {
            if (!data.resource) {
                return;
            }

            _.each(self.profiles.items(), function(item) {
                item.isdefault(false);
            });
            var item = self.profiles.getItem(function(item) {
                return item.key == data.key;
            });
            if (item !== undefined) {
                item.isdefault(true);
            }

            $.ajax({
                url: data.resource(),
                type: "PATCH",
                dataType: "json",
                data: JSON.stringify({default: true}),
                contentType: "application/json; charset=UTF-8",
                success: function() {
                    self.requestData();
                }
            });
        };

        self.showImportProfileDialog = function() {
            $("#settings_plugin_cura_import").modal("show");
        };

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "slicing/cura/profiles",
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.fromResponse = function(data) {
            var profiles = [];
            _.each(_.keys(data), function(key) {
                profiles.push({
                    key: key,
                    name: ko.observable(data[key].displayName),
                    description: ko.observable(data[key].description),
                    isdefault: ko.observable(data[key].default),
                    resource: ko.observable(data[key].resource)
                });
            });
            self.profiles.updateItems(profiles);
        };

        self.onBeforeBinding = function () {
            self.settings = self.settingsViewModel.settings;
            self.requestData();
        };
    }

    // view model class, parameters for constructor, container to bind to
    OCTOPRINT_VIEWMODELS.push([
        CuraViewModel,
        ["loginStateViewModel", "settingsViewModel", "slicingViewModel"],
        "#settings_plugin_cura"
    ]);
});
;

$(function() {
    function SoftwareUpdateViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];
        self.popup = undefined;

        self.forceUpdate = false;

        self.updateInProgress = false;
        self.waitingForRestart = false;
        self.restartTimeout = undefined;

        self.currentlyBeingUpdated = [];

        self.octoprintUnconfigured = ko.observable();
        self.octoprintUnreleased = ko.observable();

        self.config_cacheTtl = ko.observable();
        self.config_checkoutFolder = ko.observable();
        self.config_checkType = ko.observable();

        self.configurationDialog = $("#settings_plugin_softwareupdate_configurationdialog");
        self.confirmationDialog = $("#softwareupdate_confirmation_dialog");

        self.config_availableCheckTypes = [
            {"key": "github_release", "name": gettext("Release")},
            {"key": "git_commit", "name": gettext("Commit")}
        ];

        self.reloadOverlay = $("#reloadui_overlay");

        self.versions = new ItemListHelper(
            "plugin.softwareupdate.versions",
            {
                "name": function(a, b) {
                    // sorts ascending, puts octoprint first
                    if (a.key.toLocaleLowerCase() == "octoprint") return -1;
                    if (b.key.toLocaleLowerCase() == "octoprint") return 1;

                    if (a.displayName.toLocaleLowerCase() < b.displayName.toLocaleLowerCase()) return -1;
                    if (a.displayName.toLocaleLowerCase() > b.displayName.toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "name",
            [],
            [],
            5
        );

        self.availableAndPossible = ko.computed(function() {
            return _.filter(self.versions.items(), function(info) { return info.updateAvailable && info.updatePossible; });
        });

        self.onUserLoggedIn = function() {
            self.performCheck();
        };

        self._showPopup = function(options, eventListeners) {
            self._closePopup();
            self.popup = new PNotify(options);

            if (eventListeners) {
                var popupObj = self.popup.get();
                _.each(eventListeners, function(value, key) {
                    popupObj.on(key, value);
                })
            }
        };

        self._updatePopup = function(options) {
            if (self.popup === undefined) {
                self._showPopup(options);
            } else {
                self.popup.update(options);
            }
        };

        self._closePopup = function() {
            if (self.popup !== undefined) {
                self.popup.remove();
            }
        };

        self.showPluginSettings = function() {
            self._copyConfig();
            self.configurationDialog.modal();
        };

        self.savePluginSettings = function() {
            var data = {
                plugins: {
                    softwareupdate: {
                        cache_ttl: parseInt(self.config_cacheTtl()),
                        octoprint_checkout_folder: self.config_checkoutFolder(),
                        octoprint_type: self.config_checkType()
                    }
                }
            };
            self.settings.saveData(data, function() {
                self.configurationDialog.modal("hide");
                self._copyConfig();
                self.performCheck();
            });
        };

        self._copyConfig = function() {
            self.config_cacheTtl(self.settings.settings.plugins.softwareupdate.cache_ttl());
            self.config_checkoutFolder(self.settings.settings.plugins.softwareupdate.octoprint_checkout_folder());
            self.config_checkType(self.settings.settings.plugins.softwareupdate.octoprint_type());
        };

        self.fromCheckResponse = function(data, ignoreSeen, showIfNothingNew) {
            var versions = [];
            _.each(data.information, function(value, key) {
                value["key"] = key;

                if (!value.hasOwnProperty("displayName") || value.displayName == "") {
                    value.displayName = value.key;
                }
                if (!value.hasOwnProperty("displayVersion") || value.displayVersion == "") {
                    value.displayVersion = value.information.local.name;
                }
                if (!value.hasOwnProperty("releaseNotes") || value.releaseNotes == "") {
                    value.releaseNotes = undefined;
                }

                var fullNameTemplate = gettext("%(name)s: %(version)s");
                value.fullNameLocal = _.sprintf(fullNameTemplate, {name: value.displayName, version: value.displayVersion});

                var fullNameRemoteVars = {name: value.displayName, version: gettext("unknown")};
                if (value.hasOwnProperty("information") && value.information.hasOwnProperty("remote") && value.information.remote.hasOwnProperty("name")) {
                    fullNameRemoteVars.version = value.information.remote.name;
                }
                value.fullNameRemote = _.sprintf(fullNameTemplate, fullNameRemoteVars);

                versions.push(value);
            });
            self.versions.updateItems(versions);

            var octoprint = data.information["octoprint"];
            if (octoprint && octoprint.hasOwnProperty("check")) {
                var check = octoprint.check;
                if (BRANCH != "master" && check["type"] == "github_release") {
                    self.octoprintUnreleased(true);
                } else {
                    self.octoprintUnreleased(false);
                }

                var checkoutFolder = (check["checkout_folder"] || "").trim();
                var updateFolder = (check["update_folder"] || "").trim();
                var checkType = check["type"] || "";
                if ((checkType == "github_release" || checkType == "git_commit") && checkoutFolder == "" && updateFolder == "") {
                    self.octoprintUnconfigured(true);
                } else {
                    self.octoprintUnconfigured(false);
                }
            }

            if (data.status == "updateAvailable" || data.status == "updatePossible") {
                var text = "<div class='softwareupdate_notification'>" + gettext("There are updates available for the following components:");

                text += "<ul class='icons-ul'>";
                _.each(self.versions.items(), function(update_info) {
                    if (update_info.updateAvailable) {
                        text += "<li>"
                            + "<i class='icon-li " + (update_info.updatePossible ? "icon-ok" : "icon-remove")+ "'></i>"
                            + "<span class='name' title='" + update_info.fullNameRemote + "'>" + update_info.fullNameRemote + "</span>"
                            + (update_info.releaseNotes ? "<a href=\"" +  update_info.releaseNotes + "\" target=\"_blank\">" + gettext("Release Notes") + "</a>" : "")
                            + "</li>";
                    }
                });
                text += "</ul>";

                text += "<small>" + gettext("Those components marked with <i class=\"icon-ok\"></i> can be updated directly.") + "</small>";

                text += "</div>";

                var options = {
                    title: gettext("Update Available"),
                    text: text,
                    hide: false
                };
                var eventListeners = {};

                if (data.status == "updatePossible" && self.loginState.isAdmin()) {
                    // if user is admin, add action buttons
                    options["confirm"] = {
                        confirm: true,
                        buttons: [{
                            text: gettext("Ignore"),
                            click: function() {
                                self._markNotificationAsSeen(data.information);
                                self._showPopup({
                                    text: gettext("You can make this message display again via \"Settings\" > \"Software Update\" > \"Check for update now\"")
                                });
                            }
                        }, {
                            text: gettext("Update now"),
                            addClass: "btn-primary",
                            click: self.update
                        }]
                    };
                    options["buttons"] = {
                        closer: false,
                        sticker: false
                    };
                }

                if (ignoreSeen || !self._hasNotificationBeenSeen(data.information)) {
                    self._showPopup(options, eventListeners);
                }
            } else if (data.status == "current") {
                if (showIfNothingNew) {
                    self._showPopup({
                        title: gettext("Everything is up-to-date"),
                        hide: false,
                        type: "success"
                    });
                } else {
                    self._closePopup();
                }
            }
        };

        self.performCheck = function(showIfNothingNew, force, ignoreSeen) {
            if (!self.loginState.isUser()) return;

            var url = PLUGIN_BASEURL + "softwareupdate/check";
            if (force) {
                url += "?force=true";
            }

            $.ajax({
                url: url,
                type: "GET",
                dataType: "json",
                success: function(data) {
                    self.fromCheckResponse(data, ignoreSeen, showIfNothingNew);
                }
            });
        };

        self._markNotificationAsSeen = function(data) {
            if (!Modernizr.localstorage)
                return false;
            localStorage["plugin.softwareupdate.seen_information"] = JSON.stringify(self._informationToRemoteVersions(data));
        };

        self._hasNotificationBeenSeen = function(data) {
            if (!Modernizr.localstorage)
                return false;

            if (localStorage["plugin.softwareupdate.seen_information"] == undefined)
                return false;

            var knownData = JSON.parse(localStorage["plugin.softwareupdate.seen_information"]);
            var freshData = self._informationToRemoteVersions(data);

            var hasBeenSeen = true;
            _.each(freshData, function(value, key) {
                if (!_.has(knownData, key) || knownData[key] != freshData[key]) {
                    hasBeenSeen = false;
                }
            });
            return hasBeenSeen;
        };

        self._informationToRemoteVersions = function(data) {
            var result = {};
            _.each(data, function(value, key) {
                result[key] = value.information.remote.value;
            });
            return result;
        };

        self.performUpdate = function(force, items) {
            self.updateInProgress = true;

            var options = {
                title: gettext("Updating..."),
                text: gettext("Now updating, please wait."),
                icon: "icon-cog icon-spin",
                hide: false,
                buttons: {
                    closer: false,
                    sticker: false
                }
            };
            self._showPopup(options);

            var postData = {
                force: (force == true)
            };
            if (items != undefined) {
                postData.check = items;
            }

            $.ajax({
                url: PLUGIN_BASEURL + "softwareupdate/update",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(postData),
                error: function() {
                    self.updateInProgress = false;
                    self._showPopup({
                        title: gettext("Update not started!"),
                        text: gettext("The update could not be started. Is it already active? Please consult the log for details."),
                        type: "error",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    });
                },
                success: function(data) {
                    self.currentlyBeingUpdated = data.checks;
                }
            });
        };

        self.update = function(force) {
            if (self.updateInProgress) return;
            if (!self.loginState.isAdmin()) return;

            if (self.printerState.isPrinting()) {
                self._showPopup({
                    title: gettext("Can't update while printing"),
                    text: gettext("A print job is currently in progress. Updating will be prevented until it is done."),
                    type: "error"
                });
            } else {
                self.forceUpdate = (force == true);
                self.confirmationDialog.modal("show");
            }

        };

        self.confirmUpdate = function() {
            self.confirmationDialog.hide();
            self.performUpdate(self.forceUpdate,
                               _.map(self.availableAndPossible(), function(info) { return info.key }));
        };

        self.onServerDisconnect = function() {
            if (self.restartTimeout !== undefined) {
                clearTimeout(self.restartTimeout);
            }
            return true;
        };

        self.onDataUpdaterReconnect = function() {
            if (self.waitingForRestart) {
                self.waitingForRestart = false;
                self.updateInProgress = false;
                if (!self.reloadOverlay.is(":visible")) {
                    self.reloadOverlay.show();
                }
            }
        };

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin != "softwareupdate") {
                return;
            }

            var messageType = data.type;
            var messageData = data.data;

            var options = undefined;

            switch (messageType) {
                case "updating": {
                    console.log(JSON.stringify(messageData));

                    var name = self.currentlyBeingUpdated[messageData.target];
                    if (name == undefined) {
                        name = messageData.target;
                    }

                    self._updatePopup({
                        text: _.sprintf(gettext("Now updating %(name)s to %(version)s"), {name: name, version: messageData.version})
                    });
                    break;
                }
                case "restarting": {
                    console.log(JSON.stringify(messageData));

                    options = {
                        title: gettext("Update successful, restarting!"),
                        text: gettext("The update finished successfully and the server will now be restarted."),
                        type: "success",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    };

                    self.waitingForRestart = true;
                    self.restartTimeout = setTimeout(function() {
                        self._showPopup({
                            title: gettext("Restart failed"),
                            text: gettext("The server apparently did not restart by itself, you'll have to do it manually. Please consult the log file on what went wrong."),
                            type: "error",
                            hide: false,
                            buttons: {
                                sticker: false
                            }
                        });
                        self.waitingForRestart = false;
                    }, 60000);

                    break;
                }
                case "restart_manually": {
                    console.log(JSON.stringify(messageData));

                    var restartType = messageData.restart_type;
                    var text = gettext("The update finished successfully, please restart RaionPi now.");
                    if (restartType == "environment") {
                        text = gettext("The update finished successfully, please reboot the server now.");
                    }

                    options = {
                        title: gettext("Update successful, restart required!"),
                        text: text,
                        type: "success",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    };
                    self.updateInProgress = false;
                    break;
                }
                case "restart_failed": {
                    var restartType = messageData.restart_type;
                    var text = gettext("Restarting RaionPi failed, please restart it manually. You might also want to consult the log file on what went wrong here.");
                    if (restartType == "environment") {
                        text = gettext("Rebooting the server failed, please reboot it manually. You might also want to consult the log file on what went wrong here.");
                    }

                    options = {
                        title: gettext("Restart failed"),
                        test: gettext("The server apparently did not restart by itself, you'll have to do it manually. Please consult the log file on what went wrong."),
                        type: "error",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    };
                    self.waitingForRestart = false;
                    self.updateInProgress = false;
                    break;
                }
                case "success": {
                    options = {
                        title: gettext("Update successful!"),
                        text: gettext("The update finished successfully."),
                        type: "success",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    };
                    self.updateInProgress = false;
                    break;
                }
                case "error": {
                    self._showPopup({
                        title: gettext("Update failed!"),
                        text: gettext("The update did not finish successfully. Please consult the log for details."),
                        type: "error",
                        hide: false,
                        buttons: {
                            sticker: false
                        }
                    });
                    self.updateInProgress = false;
                    break;
                }
                case "update_versions": {
                    self.performCheck();
                    break;
                }
            }

            if (options != undefined) {
                self._showPopup(options);
            }
        };

    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([
        SoftwareUpdateViewModel,
        ["loginStateViewModel", "printerStateViewModel", "settingsViewModel"],
        ["#settings_plugin_softwareupdate", "#softwareupdate_confirmation_dialog"]
    ]);
});

;

$(function() {
    function PluginManagerViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];
        self.printerState = parameters[2];

        self.config_repositoryUrl = ko.observable();
        self.config_repositoryTtl = ko.observable();
        self.config_pipCommand = ko.observable();
        self.config_pipAdditionalArgs = ko.observable();

        self.configurationDialog = $("#settings_plugin_pluginmanager_configurationdialog");

        self.plugins = new ItemListHelper(
            "plugin.pluginmanager.installedplugins",
            {
                "name": function (a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            5
        );

        self.repositoryplugins = new ItemListHelper(
            "plugin.pluginmanager.repositoryplugins",
            {
                "title": function (a, b) {
                    // sorts ascending
                    if (a["title"].toLocaleLowerCase() < b["title"].toLocaleLowerCase()) return -1;
                    if (a["title"].toLocaleLowerCase() > b["title"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "published": function (a, b) {
                    // sorts descending
                    if (a["published"].toLocaleLowerCase() > b["published"].toLocaleLowerCase()) return -1;
                    if (a["published"].toLocaleLowerCase() < b["published"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
                "filter_installed": function(plugin) {
                    return !self.installed(plugin);
                },
                "filter_incompatible": function(plugin) {
                    return plugin.is_compatible.octoprint && plugin.is_compatible.os;
                }
            },
            "title",
            ["filter_installed", "filter_incompatible"],
            [],
            0
        );

        self.uploadElement = $("#settings_plugin_pluginmanager_repositorydialog_upload");
        self.uploadButton = $("#settings_plugin_pluginmanager_repositorydialog_upload_start");

        self.repositoryAvailable = ko.observable(false);

        self.repositorySearchQuery = ko.observable();
        self.repositorySearchQuery.subscribe(function() {
            self.performRepositorySearch();
        });

        self.installUrl = ko.observable();
        self.uploadFilename = ko.observable();

        self.loglines = ko.observableArray([]);
        self.installedPlugins = ko.observableArray([]);

        self.followDependencyLinks = ko.observable(false);

        self.pipAvailable = ko.observable(false);
        self.pipCommand = ko.observable();
        self.pipVersion = ko.observable();
        self.pipUseSudo = ko.observable();
        self.pipAdditionalArgs = ko.observable();

        self.working = ko.observable(false);
        self.workingTitle = ko.observable();
        self.workingDialog = undefined;
        self.workingOutput = undefined;

        self.enableManagement = ko.pureComputed(function() {
            return !self.printerState.isPrinting();
        });

        self.enableToggle = function(data) {
            return self.enableManagement() && data.key != 'pluginmanager';
        };

        self.enableUninstall = function(data) {
            return self.enableManagement()
                && (data.origin != "entry_point" || self.pipAvailable())
                && !data.bundled
                && data.key != 'pluginmanager'
                && !data.pending_uninstall;
        };

        self.enableRepoInstall = function(data) {
            return self.enableManagement() && self.pipAvailable() && self.isCompatible(data);
        };

        self.invalidUrl = ko.pureComputed(function() {
            var url = self.installUrl();
            return url !== undefined && url.trim() != "" && !(_.startsWith(url.toLocaleLowerCase(), "http://") || _.startsWith(url.toLocaleLowerCase(), "https://"));
        });

        self.enableUrlInstall = ko.pureComputed(function() {
            var url = self.installUrl();
            return self.enableManagement() && self.pipAvailable() && url !== undefined && url.trim() != "" && !self.invalidUrl();
        });

        self.invalidArchive = ko.pureComputed(function() {
            var name = self.uploadFilename();
            return name !== undefined && !(_.endsWith(name.toLocaleLowerCase(), ".zip") || _.endsWith(name.toLocaleLowerCase(), ".tar.gz") || _.endsWith(name.toLocaleLowerCase(), ".tgz") || _.endsWith(name.toLocaleLowerCase(), ".tar"));
        });

        self.enableArchiveInstall = ko.pureComputed(function() {
            var name = self.uploadFilename();
            return self.enableManagement() && self.pipAvailable() && name !== undefined && name.trim() != "" && !self.invalidArchive();
        });

        self.uploadElement.fileupload({
            dataType: "json",
            maxNumberOfFiles: 1,
            autoUpload: false,
            add: function(e, data) {
                if (data.files.length == 0) {
                    return false;
                }

                self.uploadFilename(data.files[0].name);

                self.uploadButton.unbind("click");
                self.uploadButton.bind("click", function() {
                    self._markWorking(gettext("Installing plugin..."), gettext("Installing plugin from uploaded archive..."));
                    data.formData = {
                        dependency_links: self.followDependencyLinks()
                    };
                    data.submit();
                    return false;
                });
            },
            done: function(e, data) {
                self._markDone();
                self.uploadButton.unbind("click");
                self.uploadFilename("");
            },
            fail: function(e, data) {
                new PNotify({
                    title: gettext("Something went wrong"),
                    text: gettext("Please consult octoprint.log for details"),
                    type: "error",
                    hide: false
                });
                self._markDone();
                self.uploadButton.unbind("click");
                self.uploadFilename("");
            }
        });

        self.performRepositorySearch = function() {
            var query = self.repositorySearchQuery();
            if (query !== undefined && query.trim() != "") {
                query = query.toLocaleLowerCase();
                self.repositoryplugins.changeSearchFunction(function(entry) {
                    return entry && (entry["title"].toLocaleLowerCase().indexOf(query) > -1 || entry["description"].toLocaleLowerCase().indexOf(query) > -1);
                });
            } else {
                self.repositoryplugins.resetSearch();
            }
            return false;
        };

        self.fromResponse = function(data) {
            self._fromPluginsResponse(data.plugins);
            self._fromRepositoryResponse(data.repository);
            self._fromPipResponse(data.pip);
        };

        self._fromPluginsResponse = function(data) {
            var installedPlugins = [];
            _.each(data, function(plugin) {
                installedPlugins.push(plugin.key);
            });
            self.installedPlugins(installedPlugins);
            self.plugins.updateItems(data);
        };

        self._fromRepositoryResponse = function(data) {
            self.repositoryAvailable(data.available);
            if (data.available) {
                self.repositoryplugins.updateItems(data.plugins);
            } else {
                self.repositoryplugins.updateItems([]);
            }
        };

        self._fromPipResponse = function(data) {
            self.pipAvailable(data.available);
            if (data.available) {
                self.pipCommand(data.command);
                self.pipVersion(data.version);
                self.pipUseSudo(data.use_sudo);
                self.pipAdditionalArgs(data.additional_args);
            } else {
                self.pipCommand(undefined);
                self.pipVersion(undefined);
                self.pipUseSudo(undefined);
                self.pipAdditionalArgs(undefined);
            }
        };

        self.requestData = function(includeRepo) {
            if (!self.loginState.isAdmin()) {
                return;
            }

            $.ajax({
                url: API_BASEURL + "plugin/pluginmanager" + ((includeRepo) ? "?refresh_repository=true" : ""),
                type: "GET",
                dataType: "json",
                success: self.fromResponse
            });
        };

        self.togglePlugin = function(data) {
            if (!self.loginState.isAdmin()) {
                return;
            }

            if (!self.enableManagement()) {
                return;
            }

            if (data.key == "pluginmanager") return;

            var command = self._getToggleCommand(data);

            var payload = {plugin: data.key};
            self._postCommand(command, payload, function(response) {
                self.requestData();
            }, function() {
                new PNotify({
                    title: gettext("Something went wrong"),
                    text: gettext("Please consult octoprint.log for details"),
                    type: "error",
                    hide: false
                })
            });
        };

        self.showRepository = function() {
            self.repositoryDialog.modal("show");
        };

        self.pluginDetails = function(data) {
            window.open(data.page);
        };

        self.installFromRepository = function(data) {
            if (!self.loginState.isAdmin()) {
                return;
            }

            if (!self.enableManagement()) {
                return;
            }

            if (self.installed(data)) {
                self.installPlugin(data.archive, data.title, data.id, data.follow_dependency_links || self.followDependencyLinks());
            } else {
                self.installPlugin(data.archive, data.title, undefined, data.follow_dependency_links || self.followDependencyLinks());
            }
        };

        self.installPlugin = function(url, name, reinstall, followDependencyLinks) {
            if (!self.loginState.isAdmin()) {
                return;
            }

            if (!self.enableManagement()) {
                return;
            }

            if (url === undefined) {
                url = self.installUrl();
            }
            if (!url) return;

            if (followDependencyLinks === undefined) {
                followDependencyLinks = self.followDependencyLinks();
            }

            var workTitle, workText;
            if (!reinstall) {
                workTitle = gettext("Installing plugin...");
                if (name) {
                    workText = _.sprintf(gettext("Installing plugin \"%(name)s\" from %(url)s..."), {url: url, name: name});
                } else {
                    workText = _.sprintf(gettext("Installing plugin from %(url)s..."), {url: url});
                }
            } else {
                workTitle = gettext("Reinstalling plugin...");
                workText = _.sprintf(gettext("Reinstalling plugin \"%(name)s\" from %(url)s..."), {url: url, name: name});
            }
            self._markWorking(workTitle, workText);

            var command = "install";
            var payload = {url: url, dependency_links: followDependencyLinks};
            if (reinstall) {
                payload["plugin"] = reinstall;
                payload["force"] = true;
            }

            self._postCommand(command, payload, function(response) {
                self.requestData();
                self._markDone();
                self.installUrl("");
            }, function() {
                new PNotify({
                    title: gettext("Something went wrong"),
                    text: gettext("Please consult octoprint.log for details"),
                    type: "error",
                    hide: false
                });
                self._markDone();
            });
        };

        self.uninstallPlugin = function(data) {
            if (!self.loginState.isAdmin()) {
                return;
            }

            if (!self.enableManagement()) {
                return;
            }

            if (data.bundled) return;
            if (data.key == "pluginmanager") return;

            self._markWorking(gettext("Uninstalling plugin..."), _.sprintf(gettext("Uninstalling plugin \"%(name)s\""), {name: data.name}));

            var command = "uninstall";
            var payload = {plugin: data.key};
            self._postCommand(command, payload, function(response) {
                self.requestData();
                self._markDone();
            }, function() {
                new PNotify({
                    title: gettext("Something went wrong"),
                    text: gettext("Please consult octoprint.log for details"),
                    type: "error",
                    hide: false
                });
                self._markDone();
            });
        };

        self.refreshRepository = function() {
            if (!self.loginState.isAdmin()) {
                return;
            }

            self.requestData(true);
        };

        self.showPluginSettings = function() {
            self._copyConfig();
            self.configurationDialog.modal();
        };

        self.savePluginSettings = function() {
            var pipCommand = self.config_pipCommand();
            if (pipCommand != undefined && pipCommand.trim() == "") {
                pipCommand = null;
            }

            var repository = self.config_repositoryUrl();
            if (repository != undefined && repository.trim() == "") {
                repository = null;
            }

            var repositoryTtl;
            try {
                repositoryTtl = parseInt(self.config_repositoryTtl());
            } catch (ex) {
                repositoryTtl = null;
            }

            var pipArgs = self.config_pipAdditionalArgs();
            if (pipArgs != undefined && pipArgs.trim() == "") {
                pipArgs = null;
            }

            var data = {
                plugins: {
                    pluginmanager: {
                        repository: repository,
                        repository_ttl: repositoryTtl,
                        pip: pipCommand,
                        pip_args: pipArgs
                    }
                }
            };
            self.settingsViewModel.saveData(data, function() {
                self.configurationDialog.modal("hide");
                self._copyConfig();
                self.refreshRepository();
            });
        };

        self._copyConfig = function() {
            self.config_repositoryUrl(self.settingsViewModel.settings.plugins.pluginmanager.repository());
            self.config_repositoryTtl(self.settingsViewModel.settings.plugins.pluginmanager.repository_ttl());
            self.config_pipCommand(self.settingsViewModel.settings.plugins.pluginmanager.pip());
            self.config_pipAdditionalArgs(self.settingsViewModel.settings.plugins.pluginmanager.pip_args());
        };

        self.installed = function(data) {
            return _.includes(self.installedPlugins(), data.id);
        };

        self.isCompatible = function(data) {
            return data.is_compatible.octoprint && data.is_compatible.os;
        };

        self.installButtonText = function(data) {
            return self.isCompatible(data) ? (self.installed(data) ? gettext("Reinstall") : gettext("Install")) : gettext("Incompatible");
        };

        self._displayNotification = function(response, titleSuccess, textSuccess, textRestart, textReload, titleError, textError) {
            if (response.result) {
                if (response.needs_restart) {
                    new PNotify({
                        title: titleSuccess,
                        text: textRestart,
                        hide: false
                    });
                } else if (response.needs_refresh) {
                    new PNotify({
                        title: titleSuccess,
                        text: textReload,
                        confirm: {
                            confirm: true,
                            buttons: [{
                                text: gettext("Reload now"),
                                click: function () {
                                    location.reload(true);
                                }
                            }]
                        },
                        buttons: {
                            closer: false,
                            sticker: false
                        },
                        hide: false
                    })
                } else {
                    new PNotify({
                        title: titleSuccess,
                        text: textSuccess,
                        type: "success",
                        hide: false
                    })
                }
            } else {
                new PNotify({
                    title: titleError,
                    text: textError,
                    type: "error",
                    hide: false
                });
            }
        };

        self._postCommand = function (command, data, successCallback, failureCallback, alwaysCallback, timeout) {
            var payload = _.extend(data, {command: command});

            var params = {
                url: API_BASEURL + "plugin/pluginmanager",
                type: "POST",
                dataType: "json",
                data: JSON.stringify(payload),
                contentType: "application/json; charset=UTF-8",
                success: function(response) {
                    if (successCallback) successCallback(response);
                },
                error: function() {
                    if (failureCallback) failureCallback();
                },
                complete: function() {
                    if (alwaysCallback) alwaysCallback();
                }
            };

            if (timeout != undefined) {
                params.timeout = timeout;
            }

            $.ajax(params);
        };

        self._markWorking = function(title, line) {
            self.working(true);
            self.workingTitle(title);

            self.loglines.removeAll();
            self.loglines.push({line: line, stream: "message"});

            self.workingDialog.modal("show");
        };

        self._markDone = function() {
            self.working(false);
            self.loglines.push({line: gettext("Done!"), stream: "message"});
            self._scrollWorkingOutputToEnd();
        };

        self._scrollWorkingOutputToEnd = function() {
            self.workingOutput.scrollTop(self.workingOutput[0].scrollHeight - self.workingOutput.height());
        };

        self._getToggleCommand = function(data) {
            return ((!data.enabled || data.pending_disable) && !data.pending_enable) ? "enable" : "disable";
        };

        self.toggleButtonCss = function(data) {
            var icon = self._getToggleCommand(data) == "enable" ? "icon-circle-blank" : "icon-circle";
            var disabled = (self.enableToggle(data)) ? "" : " disabled";

            return icon + disabled;
        };

        self.toggleButtonTitle = function(data) {
            return self._getToggleCommand(data) == "enable" ? gettext("Enable Plugin") : gettext("Disable Plugin");
        };

        self.onBeforeBinding = function() {
            self.settings = self.settingsViewModel.settings;
        };

        self.onUserLoggedIn = function(user) {
            if (user.admin) {
                self.requestData();
            }
        };

        self.onStartup = function() {
            self.workingDialog = $("#settings_plugin_pluginmanager_workingdialog");
            self.workingOutput = $("#settings_plugin_pluginmanager_workingdialog_output");
            self.repositoryDialog = $("#settings_plugin_pluginmanager_repositorydialog");

            $("#settings_plugin_pluginmanager_repositorydialog_list").slimScroll({
                height: "306px",
                size: "5px",
                distance: "0",
                railVisible: true,
                alwaysVisible: true,
                scrollBy: "102px"
            });
        };

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin != "pluginmanager") {
                return;
            }

            if (!self.loginState.isAdmin()) {
                return;
            }

            if (!data.hasOwnProperty("type")) {
                return;
            }

            var messageType = data.type;

            if (messageType == "loglines" && self.working()) {
                _.each(data.loglines, function(line) {
                    self.loglines.push(line);
                });
                self._scrollWorkingOutputToEnd();
            } else if (messageType == "result") {
                var titleSuccess, textSuccess, textRestart, textReload, titleError, textError;
                var action = data.action;

                var name = "Unknown";
                if (action == "install") {
                    var unknown = false;

                    if (data.hasOwnProperty("plugin")) {
                        if (data.plugin == "unknown") {
                            unknown = true;
                        } else {
                            name = data.plugin.name;
                        }
                    }

                    if (unknown) {
                        titleSuccess = _.sprintf(gettext("Plugin installed"));
                        textSuccess = gettext("A plugin was installed successfully, however it was impossible to detect which one. Please Restart RaionPi to make sure everything will be registered properly");
                        textRestart = textSuccess;
                        textReload = textSuccess;
                    } else if (data.was_reinstalled) {
                        titleSuccess = _.sprintf(gettext("Plugin \"%(name)s\" reinstalled"), {name: name});
                        textSuccess = gettext("The plugin was reinstalled successfully");
                        textRestart = gettext("The plugin was reinstalled successfully, however a restart of RaionPi is needed for that to take effect.");
                        textReload = gettext("The plugin was reinstalled successfully, however a reload of the page is needed for that to take effect.");
                    } else {
                        titleSuccess = _.sprintf(gettext("Plugin \"%(name)s\" installed"), {name: name});
                        textSuccess = gettext("The plugin was installed successfully");
                        textRestart = gettext("The plugin was installed successfully, however a restart of RaionPi is needed for that to take effect.");
                        textReload = gettext("The plugin was installed successfully, however a reload of the page is needed for that to take effect.");
                    }

                    titleError = gettext("Something went wrong");
                    var url = "unknown";
                    if (data.hasOwnProperty("url")) {
                        url = data.url;
                    }

                    if (data.hasOwnProperty("reason")) {
                        if (data.was_reinstalled) {
                            textError = _.sprintf(gettext("Reinstalling the plugin from URL \"%(url)s\" failed: %(reason)s"), {reason: data.reason, url: url});
                        } else {
                            textError = _.sprintf(gettext("Installing the plugin from URL \"%(url)s\" failed: %(reason)s"), {reason: data.reason, url: url});
                        }
                    } else {
                        if (data.was_reinstalled) {
                            textError = _.sprintf(gettext("Reinstalling the plugin from URL \"%(url)s\" failed, please see the log for details."), {url: url});
                        } else {
                            textError = _.sprintf(gettext("Installing the plugin from URL \"%(url)s\" failed, please see the log for details."), {url: url});
                        }
                    }

                } else if (action == "uninstall") {
                    if (data.hasOwnProperty("plugin")) {
                        name = data.plugin.name;
                    }

                    titleSuccess = _.sprintf(gettext("Plugin \"%(name)s\" uninstalled"), {name: name});
                    textSuccess = gettext("The plugin was uninstalled successfully");
                    textRestart = gettext("The plugin was uninstalled successfully, however a restart of RaionPi is needed for that to take effect.");
                    textReload = gettext("The plugin was uninstalled successfully, however a reload of the page is needed for that to take effect.");

                    titleError = gettext("Something went wrong");
                    if (data.hasOwnProperty("reason")) {
                        textError = _.sprintf(gettext("Uninstalling the plugin failed: %(reason)s"), {reason: data.reason});
                    } else {
                        textError = gettext("Uninstalling the plugin failed, please see the log for details.");
                    }

                } else if (action == "enable") {
                    if (data.hasOwnProperty("plugin")) {
                        name = data.plugin.name;
                    }

                    titleSuccess = _.sprintf(gettext("Plugin \"%(name)s\" enabled"), {name: name});
                    textSuccess = gettext("The plugin was enabled successfully.");
                    textRestart = gettext("The plugin was enabled successfully, however a restart of RaionPi is needed for that to take effect.");
                    textReload = gettext("The plugin was enabled successfully, however a reload of the page is needed for that to take effect.");

                    titleError = gettext("Something went wrong");
                    if (data.hasOwnProperty("reason")) {
                        textError = _.sprintf(gettext("Toggling the plugin failed: %(reason)s"), {reason: data.reason});
                    } else {
                        textError = gettext("Toggling the plugin failed, please see the log for details.");
                    }

                } else if (action == "disable") {
                    if (data.hasOwnProperty("plugin")) {
                        name = data.plugin.name;
                    }

                    titleSuccess = _.sprintf(gettext("Plugin \"%(name)s\" disabled"), {name: name});
                    textSuccess = gettext("The plugin was disabled successfully.");
                    textRestart = gettext("The plugin was disabled successfully, however a restart of RaionPi is needed for that to take effect.");
                    textReload = gettext("The plugin was disabled successfully, however a reload of the page is needed for that to take effect.");

                    titleError = gettext("Something went wrong");
                    if (data.hasOwnProperty("reason")) {
                        textError = _.sprintf(gettext("Toggling the plugin failed: %(reason)s"), {reason: data.reason});
                    } else {
                        textError = gettext("Toggling the plugin failed, please see the log for details.");
                    }

                } else {
                    return;
                }

                self._displayNotification(data, titleSuccess, textSuccess, textRestart, textReload, titleError, textError);
                self.requestData();
            }
        };
    }

    // view model class, parameters for constructor, container to bind to
    ADDITIONAL_VIEWMODELS.push([PluginManagerViewModel, ["loginStateViewModel", "settingsViewModel", "printerStateViewModel"], "#settings_plugin_pluginmanager"]);
});

;

function DataUpdater(allViewModels) {
    var self = this;

    self.allViewModels = allViewModels;

    self._socket = undefined;
    self._autoReconnecting = false;
    self._autoReconnectTrial = 0;
    self._autoReconnectTimeouts = [0, 1, 1, 2, 3, 5, 8, 13, 20, 40, 100];
    self._autoReconnectDialogIndex = 1;

    self._pluginHash = undefined;

    self._throttleFactor = 1;
    self._baseProcessingLimit = 500.0;
    self._lastProcessingTimes = [];
    self._lastProcessingTimesSize = 20;

    self._timelapse_popup = undefined;

    self.connect = function() {
        var options = {};
        if (SOCKJS_DEBUG) {
            options["debug"] = true;
        }

        self._socket = new SockJS(SOCKJS_URI, undefined, options);
        self._socket.onopen = self._onconnect;
        self._socket.onclose = self._onclose;
        self._socket.onmessage = self._onmessage;
    };

    self.reconnect = function() {
        self._socket.close();
        delete self._socket;
        self.connect();
    };

    self.increaseThrottle = function() {
        self.setThrottle(self._throttleFactor + 1);
    };

    self.decreaseThrottle = function() {
        if (self._throttleFactor <= 1) {
            return;
        }
        self.setThrottle(self._throttleFactor - 1);
    };

    self.setThrottle = function(throttle) {
        self._throttleFactor = throttle;

        self._send("throttle", self._throttleFactor);
        log.debug("DataUpdater: New SockJS throttle factor:", self._throttleFactor, " new processing limit:", self._baseProcessingLimit * self._throttleFactor);
    };

    self._send = function(message, data) {
        var payload = {};
        payload[message] = data;
        self._socket.send(JSON.stringify(payload));
    };

    self._onconnect = function() {
        self._autoReconnecting = false;
        self._autoReconnectTrial = 0;
    };

    self._onclose = function(e) {
        if (e.code == SOCKJS_CLOSE_NORMAL) {
            return;
        }
        if (self._autoReconnectTrial >= self._autoReconnectDialogIndex) {
            // Only consider it a real disconnect if the trial number has exceeded our threshold.

            var handled = false;
            _.each(self.allViewModels, function(viewModel) {
                if (handled == true) {
                    return;
                }

                if (viewModel.hasOwnProperty("onServerDisconnect")) {
                    var result = viewModel.onServerDisconnect();
                    if (result !== undefined && !result) {
                        handled = true;
                    }
                }
            });

            if (handled) {
                return;
            }

            showOfflineOverlay(
                gettext("Server is offline"),
                gettext("The server appears to be offline, at least I'm not getting any response from it. I'll try to reconnect automatically <strong>over the next couple of minutes</strong>, however you are welcome to try a manual reconnect anytime using the button below."),
                self.reconnect
            );
        }

        if (self._autoReconnectTrial < self._autoReconnectTimeouts.length) {
            var timeout = self._autoReconnectTimeouts[self._autoReconnectTrial];
            log.info("Reconnect trial #" + self._autoReconnectTrial + ", waiting " + timeout + "s");
            setTimeout(self.reconnect, timeout * 1000);
            self._autoReconnectTrial++;
        } else {
            self._onreconnectfailed();
        }
    };

    self._onreconnectfailed = function() {
        var handled = false;
        _.each(self.allViewModels, function(viewModel) {
            if (handled == true) {
                return;
            }

            if (viewModel.hasOwnProperty("onServerDisconnect")) {
                var result = viewModel.onServerDisconnect();
                if (result !== undefined && !result) {
                    handled = true;
                }
            }
        });

        if (handled) {
            return;
        }

        $("#offline_overlay_title").text(gettext("Server is offline"));
        $("#offline_overlay_message").html(gettext("The server appears to be offline, at least I'm not getting any response from it. I <strong>could not reconnect automatically</strong>, but you may try a manual reconnect using the button below."));
    };

    self._onmessage = function(e) {
        for (var prop in e.data) {
            if (!e.data.hasOwnProperty(prop)) {
                continue;
            }

            var data = e.data[prop];

            var gcodeUploadProgress = $("#gcode_upload_progress");
            var gcodeUploadProgressBar = $(".bar", gcodeUploadProgress);

            var start = new Date().getTime();
            switch (prop) {
                case "connected": {
                    // update the current UI API key and send it with any request
                    UI_API_KEY = data["apikey"];
                    $.ajaxSetup({
                        headers: {"X-Api-Key": UI_API_KEY}
                    });

                    var oldVersion = VERSION;
                    VERSION = data["version"];
                    DISPLAY_VERSION = data["display_version"];
                    BRANCH = data["branch"];
                    $("span.version").text(DISPLAY_VERSION);

                    var oldPluginHash = self._pluginHash;
                    self._pluginHash = data["plugin_hash"];

                    if ($("#offline_overlay").is(":visible")) {
                        hideOfflineOverlay();
                        _.each(self.allViewModels, function(viewModel) {
                            if (viewModel.hasOwnProperty("onServerReconnect")) {
                                viewModel.onServerReconnect();
                            } else if (viewModel.hasOwnProperty("onDataUpdaterReconnect")) {
                                viewModel.onDataUpdaterReconnect();
                            }
                        });

                        if ($('#tabs li[class="active"] a').attr("href") == "#control") {
                            $("#webcam_image").attr("src", CONFIG_WEBCAM_STREAM + "?" + new Date().getTime());
                        }
                    } else {
                        _.each(self.allViewModels, function(viewModel) {
                            if (viewModel.hasOwnProperty("onServerConnect")) {
                                viewModel.onServerConnect();
                            }
                        });
                    }

                    if (oldVersion != VERSION || (oldPluginHash != undefined && oldPluginHash != self._pluginHash)) {
                        showReloadOverlay();
                    }

                    self.setThrottle(1);

                    break;
                }
                case "history": {
                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("fromHistoryData")) {
                            viewModel.fromHistoryData(data);
                        }
                    });
                    break;
                }
                case "current": {
                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("fromCurrentData")) {
                            viewModel.fromCurrentData(data);
                        }
                    });
                    break;
                }
                case "slicingProgress": {
                    gcodeUploadProgressBar.text(_.sprintf(gettext("Slicing ... (%(percentage)d%%)"), {percentage: Math.round(data["progress"])}));

                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("onSlicingProgress")) {
                            viewModel.onSlicingProgress(data["slicer"], data["model_path"], data["machinecode_path"], data["progress"]);
                        }
                    });
                    break;
                }
                case "event": {
                    var type = data["type"];
                    var payload = data["payload"];
                    var html = "";
                    var format = {};

                    log.debug("Got event " + type + " with payload: " + JSON.stringify(payload));

                    if (type == "MovieRendering") {
                        if (self._timelapse_popup !== undefined) {
                            self._timelapse_popup.remove();
                        }
                        self._timelapse_popup = new PNotify({
                            title: gettext("Rendering timelapse"),
                            text: _.sprintf(gettext("Now rendering timelapse %(movie_basename)s. Due to performance reasons it is not recommended to start a print job while a movie is still rendering."), payload),
                            hide: false,
                            callbacks: {
                                before_close: function() {
                                    self._timelapse_popup = undefined;
                                }
                            }
                        });
                    } else if (type == "MovieDone") {
                        if (self._timelapse_popup !== undefined) {
                            self._timelapse_popup.remove();
                        }
                        self._timelapse_popup = new PNotify({
                            title: gettext("Timelapse ready"),
                            text: _.sprintf(gettext("New timelapse %(movie_basename)s is done rendering."), payload),
                            type: "success",
                            callbacks: {
                                before_close: function(notice) {
                                    if (self._timelapse_popup == notice) {
                                        self._timelapse_popup = undefined;
                                    }
                                }
                            }
                        });
                    } else if (type == "MovieFailed") {
                        html = "<p>" + _.sprintf(gettext("Rendering of timelapse %(movie_basename)s failed with return code %(returncode)s"), payload) + "</p>";
                        html += pnotifyAdditionalInfo('<pre style="overflow: auto">' + payload.error + '</pre>');

                        if (self._timelapse_popup !== undefined) {
                            self._timelapse_popup.remove();
                        }
                        self._timelapse_popup = new PNotify({
                            title: gettext("Rendering failed"),
                            text: html,
                            type: "error",
                            hide: false,
                            callbacks: {
                                before_close: function(notice) {
                                    if (self._timelapse_popup == notice) {
                                        self._timelapse_popup = undefined;
                                    }
                                }
                            }
                        });
                    } else if (type == "PostRollStart") {
                        var title = gettext("Capturing timelapse postroll");

                        var text;
                        if (!payload.postroll_duration) {
                            text = _.sprintf(gettext("Now capturing timelapse post roll, this will take only a moment..."), format);
                        } else {
                            format = {
                                time: moment().add(payload.postroll_duration, "s").format("LT")
                            };

                            if (payload.postroll_duration > 60) {
                                format.duration = _.sprintf(gettext("%(minutes)d min"), {minutes: payload.postroll_duration / 60});
                                text = _.sprintf(gettext("Now capturing timelapse post roll, this will take approximately %(duration)s (so until %(time)s)..."), format);
                            } else {
                                format.duration = _.sprintf(gettext("%(seconds)d sec"), {seconds: payload.postroll_duration});
                                text = _.sprintf(gettext("Now capturing timelapse post roll, this will take approximately %(duration)s..."), format);
                            }
                        }

                        if (self._timelapse_popup !== undefined) {
                            self._timelapse_popup.remove();
                        }
                        self._timelapse_popup = new PNotify({
                            title: title,
                            text: text,
                            hide: false,
                            callbacks: {
                                before_close: function(notice) {
                                    if (self._timelapse_popup == notice) {
                                        self._timelapse_popup = undefined;
                                    }
                                }
                            }
                        });
                    } else if (type == "SlicingStarted") {
                        gcodeUploadProgress.addClass("progress-striped").addClass("active");
                        gcodeUploadProgressBar.css("width", "100%");
                        if (payload.progressAvailable) {
                            gcodeUploadProgressBar.text(_.sprintf(gettext("Slicing ... (%(percentage)d%%)"), {percentage: 0}));
                        } else {
                            gcodeUploadProgressBar.text(gettext("Slicing ..."));
                        }
                    } else if (type == "SlicingDone") {
                        gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
                        gcodeUploadProgressBar.css("width", "0%");
                        gcodeUploadProgressBar.text("");
                        new PNotify({title: gettext("Slicing done"), text: _.sprintf(gettext("Sliced %(stl)s to %(gcode)s, took %(time).2f seconds"), payload), type: "success"});
                    } else if (type == "SlicingCancelled") {
                        gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
                        gcodeUploadProgressBar.css("width", "0%");
                        gcodeUploadProgressBar.text("");
                    } else if (type == "SlicingFailed") {
                        gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
                        gcodeUploadProgressBar.css("width", "0%");
                        gcodeUploadProgressBar.text("");

                        html = _.sprintf(gettext("Could not slice %(stl)s to %(gcode)s: %(reason)s"), payload);
                        new PNotify({title: gettext("Slicing failed"), text: html, type: "error", hide: false});
                    } else if (type == "TransferStarted") {
                        gcodeUploadProgress.addClass("progress-striped").addClass("active");
                        gcodeUploadProgressBar.css("width", "100%");
                        gcodeUploadProgressBar.text(gettext("Streaming ..."));
                    } else if (type == "TransferDone") {
                        gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
                        gcodeUploadProgressBar.css("width", "0%");
                        gcodeUploadProgressBar.text("");
                        new PNotify({
                            title: gettext("Streaming done"),
                            text: _.sprintf(gettext("Streamed %(local)s to %(remote)s on SD, took %(time).2f seconds"), payload),
                            type: "success"
                        });
                    } else if (type == "PrintCancelled") {
                        if (payload.firmwareError) {
                            new PNotify({
                                title: gettext("Unhandled communication error"),
                                text: _.sprintf(gettext("There was an unhandled error while talking to the printer. Due to that the ongoing print job was cancelled. Error: %(firmwareError)s"), payload),
                                type: "error",
                                hide: false
                            });
                        }
                    } else if (type == "Error") {
                        new PNotify({
                                title: gettext("Unhandled communication error"),
                                text: _.sprintf(gettext("The was an unhandled error while talking to the printer. Due to that RaionPi disconnected. Error: %(error)s"), payload),
                                type: "error",
                                hide: false
                        });
                    }

                    var legacyEventHandlers = {
                        "UpdatedFiles": "onUpdatedFiles",
                        "MetadataStatisticsUpdated": "onMetadataStatisticsUpdated",
                        "MetadataAnalysisFinished": "onMetadataAnalysisFinished",
                        "SlicingDone": "onSlicingDone",
                        "SlicingCancelled": "onSlicingCancelled",
                        "SlicingFailed": "onSlicingFailed"
                    };
                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("onEvent" + type)) {
                            viewModel["onEvent" + type](payload);
                        } else if (legacyEventHandlers.hasOwnProperty(type) && viewModel.hasOwnProperty(legacyEventHandlers[type])) {
                            // there might still be code that uses the old callbacks, make sure those still get called
                            // but log a warning
                            log.warn("View model " + viewModel.name + " is using legacy event handler " + legacyEventHandlers[type] + ", new handler is called " + legacyEventHandlers[type]);
                            viewModel[legacyEventHandlers[type]](payload);
                        }
                    });

                    break;
                }
                case "timelapse": {
                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("fromTimelapseData")) {
                            viewModel.fromTimelapseData(data);
                        }
                    });
                    break;
                }
                case "plugin": {
                    _.each(self.allViewModels, function(viewModel) {
                        if (viewModel.hasOwnProperty("onDataUpdaterPluginMessage")) {
                            viewModel.onDataUpdaterPluginMessage(data.plugin, data.data);
                        }
                    })
                }
            }

            var end = new Date().getTime();
            var difference = end - start;

            while (self._lastProcessingTimes.length >= self._lastProcessingTimesSize) {
                self._lastProcessingTimes.shift();
            }
            self._lastProcessingTimes.push(difference);

            var processingLimit = self._throttleFactor * self._baseProcessingLimit;
            if (difference > processingLimit) {
                self.increaseThrottle();
                log.debug("We are slow (" + difference + " > " + processingLimit + "), reducing refresh rate");
            } else if (self._throttleFactor > 1) {
                var maxProcessingTime = Math.max.apply(null, self._lastProcessingTimes);
                var lowerProcessingLimit = (self._throttleFactor - 1) * self._baseProcessingLimit;
                if (maxProcessingTime < lowerProcessingLimit) {
                    self.decreaseThrottle();
                    log.debug("We are fast (" + maxProcessingTime + " < " + lowerProcessingLimit + "), increasing refresh rate");
                }
            }
        }
    };

    self.connect();
}

;

function ItemListHelper(listType, supportedSorting, supportedFilters, defaultSorting, defaultFilters, exclusiveFilters, filesPerPage) {
    var self = this;

    self.listType = listType;
    self.supportedSorting = supportedSorting;
    self.supportedFilters = supportedFilters;
    self.defaultSorting = defaultSorting;
    self.defaultFilters = defaultFilters;
    self.exclusiveFilters = exclusiveFilters;

    self.searchFunction = undefined;

    self.allItems = [];
    self.allSize = ko.observable(0);

    self.items = ko.observableArray([]);
    self.pageSize = ko.observable(filesPerPage);
    self.currentPage = ko.observable(0);
    self.currentSorting = ko.observable(self.defaultSorting);
    self.currentFilters = ko.observableArray(self.defaultFilters);
    self.selectedItem = ko.observable(undefined);

    //~~ item handling

    self.refresh = function() {
        self._updateItems();
    };

    self.updateItems = function(items) {
        self.allItems = items;
        self.allSize(items.length);
        self._updateItems();
    };

    self.selectItem = function(matcher) {
        var itemList = self.items();
        for (var i = 0; i < itemList.length; i++) {
            if (matcher(itemList[i])) {
                self.selectedItem(itemList[i]);
                break;
            }
        }
    };

    self.selectNone = function() {
        self.selectedItem(undefined);
    };

    self.isSelected = function(data) {
        return self.selectedItem() == data;
    };

    self.isSelectedByMatcher = function(matcher) {
        return matcher(self.selectedItem());
    };

    self.removeItem = function(matcher) {
        var item = self.getItem(matcher, true);
        if (item === undefined) {
            return;
        }

        var index = self.allItems.indexOf(item);
        if (index > -1) {
            self.allItems.splice(index, 1);
            self._updateItems();
        }
    };

    //~~ pagination

    self.paginatedItems = ko.dependentObservable(function() {
        if (self.items() == undefined) {
            return [];
        } else if (self.pageSize() == 0) {
            return self.items();
        } else {
            var from = Math.max(self.currentPage() * self.pageSize(), 0);
            var to = Math.min(from + self.pageSize(), self.items().length);
            return self.items().slice(from, to);
        }
    });
    self.lastPage = ko.dependentObservable(function() {
        return (self.pageSize() == 0 ? 1 : Math.ceil(self.items().length / self.pageSize()) - 1);
    });
    self.pages = ko.dependentObservable(function() {
        var pages = [];
        if (self.pageSize() == 0) {
            pages.push({ number: 0, text: 1 });
        } else if (self.lastPage() < 7) {
            for (var i = 0; i < self.lastPage() + 1; i++) {
                pages.push({ number: i, text: i+1 });
            }
        } else {
            pages.push({ number: 0, text: 1 });
            if (self.currentPage() < 5) {
                for (var i = 1; i < 5; i++) {
                    pages.push({ number: i, text: i+1 });
                }
                pages.push({ number: -1, text: "…"});
            } else if (self.currentPage() > self.lastPage() - 5) {
                pages.push({ number: -1, text: "…"});
                for (var i = self.lastPage() - 4; i < self.lastPage(); i++) {
                    pages.push({ number: i, text: i+1 });
                }
            } else {
                pages.push({ number: -1, text: "…"});
                for (var i = self.currentPage() - 1; i <= self.currentPage() + 1; i++) {
                    pages.push({ number: i, text: i+1 });
                }
                pages.push({ number: -1, text: "…"});
            }
            pages.push({ number: self.lastPage(), text: self.lastPage() + 1})
        }
        return pages;
    });

    self.switchToItem = function(matcher) {
        var pos = -1;
        var itemList = self.items();
        for (var i = 0; i < itemList.length; i++) {
            if (matcher(itemList[i])) {
                pos = i;
                break;
            }
        }

        if (pos > -1) {
            var page = Math.floor(pos / self.pageSize());
            self.changePage(page);
        }
    };

    self.changePage = function(newPage) {
        if (newPage < 0 || newPage > self.lastPage())
            return;
        self.currentPage(newPage);
    };    self.prevPage = function() {
        if (self.currentPage() > 0) {
            self.currentPage(self.currentPage() - 1);
        }
    };
    self.nextPage = function() {
        if (self.currentPage() < self.lastPage()) {
            self.currentPage(self.currentPage() + 1);
        }
    };

    self.getItem = function(matcher, all) {
        var itemList;
        if (all !== undefined && all === true) {
            itemList = self.allItems;
        } else {
            itemList = self.items();
        }
        for (var i = 0; i < itemList.length; i++) {
            if (matcher(itemList[i])) {
                return itemList[i];
            }
        }

        return undefined;
    };

    //~~ searching

    self.changeSearchFunction = function(searchFunction) {
        self.searchFunction = searchFunction;
        self.changePage(0);
        self._updateItems();
    };

    self.resetSearch = function() {
        self.changeSearchFunction(undefined);
    };

    //~~ sorting

    self.changeSorting = function(sorting) {
        if (!_.contains(_.keys(self.supportedSorting), sorting))
            return;

        self.currentSorting(sorting);
        self._saveCurrentSortingToLocalStorage();

        self.changePage(0);
        self._updateItems();
    };

    //~~ filtering

    self.toggleFilter = function(filter) {
        if (!_.contains(_.keys(self.supportedFilters), filter))
            return;

        if (_.contains(self.currentFilters(), filter)) {
            self.removeFilter(filter);
        } else {
            self.addFilter(filter);
        }
    };

    self.addFilter = function(filter) {
        if (!_.contains(_.keys(self.supportedFilters), filter))
            return;

        for (var i = 0; i < self.exclusiveFilters.length; i++) {
            if (_.contains(self.exclusiveFilters[i], filter)) {
                for (var j = 0; j < self.exclusiveFilters[i].length; j++) {
                    if (self.exclusiveFilters[i][j] == filter)
                        continue;
                    self.removeFilter(self.exclusiveFilters[i][j]);
                }
            }
        }

        var filters = self.currentFilters();
        filters.push(filter);
        self.currentFilters(filters);
        self._saveCurrentFiltersToLocalStorage();

        self.changePage(0);
        self._updateItems();
    };

    self.removeFilter = function(filter) {
        if (!_.contains(_.keys(self.supportedFilters), filter))
            return;

        var filters = self.currentFilters();
        filters.pop(filter);
        self.currentFilters(filters);
        self._saveCurrentFiltersToLocalStorage();

        self.changePage(0);
        self._updateItems();
    };

    //~~ update for sorted and filtered view

    self._updateItems = function() {
        // determine comparator
        var comparator = undefined;
        var currentSorting = self.currentSorting();
        if (typeof currentSorting !== undefined && typeof self.supportedSorting[currentSorting] !== undefined) {
            comparator = self.supportedSorting[currentSorting];
        }

        // work on all items
        var result = self.allItems;

        // filter if necessary
        var filters = self.currentFilters();
        _.each(filters, function(filter) {
            if (typeof filter !== undefined && typeof supportedFilters[filter] !== undefined)
                result = _.filter(result, supportedFilters[filter]);
        });

        // search if necessary
        if (typeof self.searchFunction !== undefined && self.searchFunction) {
            result = _.filter(result, self.searchFunction);
        }

        // sort if necessary
        if (typeof comparator !== undefined)
            result.sort(comparator);

        // set result list
        self.items(result);
    };

    //~~ local storage

    self._saveCurrentSortingToLocalStorage = function() {
        if ( self._initializeLocalStorage() ) {
            var currentSorting = self.currentSorting();
            if (currentSorting !== undefined)
                localStorage[self.listType + "." + "currentSorting"] = currentSorting;
            else
                localStorage[self.listType + "." + "currentSorting"] = undefined;
        }
    };

    self._loadCurrentSortingFromLocalStorage = function() {
        if ( self._initializeLocalStorage() ) {
            if (_.contains(_.keys(supportedSorting), localStorage[self.listType + "." + "currentSorting"]))
                self.currentSorting(localStorage[self.listType + "." + "currentSorting"]);
            else
                self.currentSorting(defaultSorting);
        }
    };

    self._saveCurrentFiltersToLocalStorage = function() {
        if ( self._initializeLocalStorage() ) {
            var filters = _.intersection(_.keys(self.supportedFilters), self.currentFilters());
            localStorage[self.listType + "." + "currentFilters"] = JSON.stringify(filters);
        }
    };

    self._loadCurrentFiltersFromLocalStorage = function() {
        if ( self._initializeLocalStorage() ) {
            self.currentFilters(_.intersection(_.keys(self.supportedFilters), JSON.parse(localStorage[self.listType + "." + "currentFilters"])));
        }
    };

    self._initializeLocalStorage = function() {
        if (!Modernizr.localstorage)
            return false;

        if (localStorage[self.listType + "." + "currentSorting"] !== undefined && localStorage[self.listType + "." + "currentFilters"] !== undefined && JSON.parse(localStorage[self.listType + "." + "currentFilters"]) instanceof Array)
            return true;

        localStorage[self.listType + "." + "currentSorting"] = self.defaultSorting;
        localStorage[self.listType + "." + "currentFilters"] = JSON.stringify(self.defaultFilters);

        return true;
    };

    self._loadCurrentFiltersFromLocalStorage();
    self._loadCurrentSortingFromLocalStorage();
}

function formatSize(bytes) {
    if (!bytes) return "-";

    var units = ["bytes", "KB", "MB", "GB"];
    for (var i = 0; i < units.length; i++) {
        if (bytes < 1024) {
            return _.sprintf("%3.1f%s", bytes, units[i]);
        }
        bytes /= 1024;
    }
    return _.sprintf("%.1f%s", bytes, "TB");
}

function bytesFromSize(size) {
    if (size == undefined || size.trim() == "") return undefined;

    var parsed = size.match(/^([+]?[0-9]*\.?[0-9]+)(?:\s*)?(.*)$/);
    var number = parsed[1];
    var unit = parsed[2].trim();

    if (unit == "") return parseFloat(number);

    var units = {
        b: 1,
        byte: 1,
        bytes: 1,
        kb: 1024,
        mb: Math.pow(1024, 2),
        gb: Math.pow(1024, 3),
        tb: Math.pow(1024, 4)
    };
    unit = unit.toLowerCase();

    if (!units.hasOwnProperty(unit)) {
        return undefined;
    }

    var factor = units[unit];
    return number * factor;
}

function formatDuration(seconds) {
    if (!seconds) return "-";
    if (seconds < 0) return "00:00:00";

    var s = seconds % 60;
    var m = (seconds % 3600) / 60;
    var h = seconds / 3600;

    return _.sprintf(gettext(/* L10N: duration format */ "%(hour)02d:%(minute)02d:%(second)02d"), {hour: h, minute: m, second: s});
}

function formatFuzzyEstimation(seconds, base) {
    if (!seconds) return "-";
    if (seconds < 0) return "-";

    var m;
    if (base != undefined) {
        m = moment(base);
    } else {
        m = moment();
    }

    m.add(seconds, "s");
    return m.fromNow(true);
}

function formatDate(unixTimestamp) {
    if (!unixTimestamp) return "-";
    return moment.unix(unixTimestamp).format(gettext(/* L10N: Date format */ "YYYY-MM-DD HH:mm"));
}

function formatTimeAgo(unixTimestamp) {
    if (!unixTimestamp) return "-";
    return moment.unix(unixTimestamp).fromNow();
}

function formatFilament(filament) {
    if (!filament || !filament["length"]) return "-";
    var result = "%(length).02fm";
    if (filament.hasOwnProperty("volume") && filament.volume) {
        result += " / " + "%(volume).02fcm³";
    }
    return _.sprintf(result, {length: filament["length"] / 1000, volume: filament["volume"]});
}

function cleanTemperature(temp) {
    if (!temp || temp < 10) return gettext("off");
    return temp;
}

function formatTemperature(temp) {
    if (!temp || temp < 10) return gettext("off");
    return _.sprintf("%.1f&deg;C", temp);
}

function pnotifyAdditionalInfo(inner) {
    return '<div class="pnotify_additional_info">'
        + '<div class="pnotify_more"><a href="#" onclick="$(this).children().toggleClass(\'icon-caret-right icon-caret-down\').parent().parent().next().slideToggle(\'fast\')">More <i class="icon-caret-right"></i></a></div>'
        + '<div class="pnotify_more_container hide">' + inner + '</div>'
        + '</div>';
}

function ping(url, callback) {
    var img = new Image();
    var calledBack = false;

    img.onload = function() {
        callback(true);
        calledBack = true;
    };
    img.onerror = function() {
        if (!calledBack) {
            callback(true);
            calledBack = true;
        }
    };
    img.src = url;
    setTimeout(function() {
        if (!calledBack) {
            callback(false);
            calledBack = true;
        }
    }, 1500);
}

function showOfflineOverlay(title, message, reconnectCallback) {
    if (title == undefined) {
        title = gettext("Server is offline");
    }

    $("#offline_overlay_title").text(title);
    $("#offline_overlay_message").html(message);
    $("#offline_overlay_reconnect").click(reconnectCallback);
    if (!$("#offline_overlay").is(":visible"))
        $("#offline_overlay").show();
}

function hideOfflineOverlay() {
    $("#offline_overlay").hide();
}

function showConfirmationDialog(message, onacknowledge) {
    var confirmationDialog = $("#confirmation_dialog");
    var confirmationDialogAck = $(".confirmation_dialog_acknowledge", confirmationDialog);

    $(".confirmation_dialog_message", confirmationDialog).text(message);
    confirmationDialogAck.unbind("click");
    confirmationDialogAck.bind("click", function (e) {
        e.preventDefault();
        $("#confirmation_dialog").modal("hide");
        onacknowledge(e);
    });
    confirmationDialog.modal("show");
}

function showReloadOverlay() {
    $("#reloadui_overlay").show();
}

function commentableLinesToArray(lines) {
    return splitTextToArray(lines, "\n", true, function(item) {return !_.startsWith(item, "#")});
}

function splitTextToArray(text, sep, stripEmpty, filter) {
    return _.filter(
        _.map(
            text.split(sep),
            function(item) { return (item) ? item.trim() : ""; }
        ),
        function(item) { return (stripEmpty ? item : true) && (filter ? filter(item) : true); }
    );
}

var sizeObservable = function(observable) {
    return ko.computed({
        read: function() {
            return formatSize(observable());
        },
        write: function(value) {
            var result = bytesFromSize(value);
            if (result != undefined) {
                observable(result);
            }
        }
    })
};

;

$(function() {
        //~~ Lodash setup

        _.mixin({"sprintf": sprintf, "vsprintf": vsprintf});

        //~~ Logging setup

        log.setLevel(CONFIG_DEBUG ? "debug" : "info");

        //~~ setup browser and internal tab tracking (in 1.3.0 that will be
        //   much nicer with the global RaionPi object...)

        var tabTracking = (function() {
            var exports = {
                browserTabVisibility: undefined,
                selectedTab: undefined
            };

            var browserVisibilityCallbacks = [];

            var getHiddenProp = function() {
                var prefixes = ["webkit", "moz", "ms", "o"];

                // if "hidden" is natively supported just return it
                if ("hidden" in document) {
                    return "hidden"
                }

                // otherwise loop over all the known prefixes until we find one
                var vendorPrefix = _.find(prefixes, function(prefix) {
                    return (prefix + "Hidden" in document);
                });
                if (vendorPrefix !== undefined) {
                    return vendorPrefix + "Hidden";
                }

                // nothing found
                return undefined;
            };

            var isHidden = function() {
                var prop = getHiddenProp();
                if (!prop) return false;

                return document[prop];
            };

            var updateBrowserVisibility = function() {
                var visible = !isHidden();
                exports.browserTabVisible = visible;
                _.each(browserVisibilityCallbacks, function(callback) {
                    callback(visible);
                })
            };

            // register for browser visibility tracking

            var prop = getHiddenProp();
            if (!prop) return undefined;

            var eventName = prop.replace(/[H|h]idden/, "") + "visibilitychange";
            document.addEventListener(eventName, updateBrowserVisibility);

            updateBrowserVisibility();

            // exports

            exports.isVisible = function() { return !isHidden() };
            exports.onBrowserVisibilityChange = function(callback) {
                browserVisibilityCallbacks.push(callback);
            };

            return exports;
        })();

        //~~ AJAX setup

        // work around a stupid iOS6 bug where ajax requests get cached and only work once, as described at
        // http://stackoverflow.com/questions/12506897/is-safari-on-ios-6-caching-ajax-results
        $.ajaxSetup({
            type: 'POST',
            headers: { "cache-control": "no-cache" }
        });

        // send the current UI API key with any request
        $.ajaxSetup({
            headers: {"X-Api-Key": UI_API_KEY}
        });

        //~~ Initialize file upload plugin

        $.widget("blueimp.fileupload", $.blueimp.fileupload, {
            options: {
                dropZone: null,
                pasteZone: null
            }
        });

        //~~ Initialize i18n

        var catalog = window["BABEL_TO_LOAD_" + LOCALE];
        if (catalog === undefined) {
            catalog = {messages: undefined, plural_expr: undefined, locale: undefined, domain: undefined}
        }
        babel.Translations.load(catalog).install();

        moment.locale(LOCALE);

        // Dummy translation requests for dynamic strings supplied by the backend
        var dummyTranslations = [
            // printer states
            gettext("Offline"),
            gettext("Opening serial port"),
            gettext("Detecting serial port"),
            gettext("Detecting baudrate"),
            gettext("Connecting"),
            gettext("Operational"),
            gettext("Printing from SD"),
            gettext("Sending file to SD"),
            gettext("Printing"),
            gettext("Paused"),
            gettext("Closed"),
            gettext("Transfering file to SD")
        ];

        //~~ Initialize PNotify

        PNotify.prototype.options.styling = "bootstrap2";
        PNotify.prototype.options.mouse_reset = false;

        //~~ Initialize view models

        // the view model map is our basic look up table for dependencies that may be injected into other view models
        var viewModelMap = {};

        // We put our tabTracking into the viewModelMap as a workaround until
        // our global RaionPi object becomes available in 1.3.0. This way
        // we'll still be able to access it in our view models.
        //
        // NOTE TO DEVELOPERS: Do NOT depend on this dependency in your custom
        // view models. It is ONLY provided for the core application to be able
        // to backport a fix from the 1.3.0 development branch and WILL BE
        // REMOVED once 1.3.0 gets released without any fallback!
        //
        // TODO: Remove with release of 1.3.0
        viewModelMap.tabTracking = tabTracking;

        // Fix Function#name on browsers that do not support it (IE):
        // see: http://stackoverflow.com/questions/6903762/function-name-not-supported-in-ie
        if (!(function f() {}).name) {
            Object.defineProperty(Function.prototype, 'name', {
                get: function() {
                    return this.toString().match(/^\s*function\s*(\S*)\s*\(/)[1];
                }
            });
        }

        // helper to create a view model instance with injected constructor parameters from the view model map
        var _createViewModelInstance = function(viewModel, viewModelMap){
            var viewModelClass = viewModel[0];
            var viewModelParameters = viewModel[1];

            if (viewModelParameters != undefined) {
                if (!_.isArray(viewModelParameters)) {
                    viewModelParameters = [viewModelParameters];
                }

                // now we'll try to resolve all of the view model's constructor parameters via our view model map
                var constructorParameters = _.map(viewModelParameters, function(parameter){
                    return viewModelMap[parameter]
                });
            } else {
                constructorParameters = [];
            }

            if (_.some(constructorParameters, function(parameter) { return parameter === undefined; })) {
                var _extractName = function(entry) { return entry[0]; };
                var _onlyUnresolved = function(entry) { return entry[1] === undefined; };
                var missingParameters = _.map(_.filter(_.zip(viewModelParameters, constructorParameters), _onlyUnresolved), _extractName);
                log.debug("Postponing", viewModel[0].name, "due to missing parameters:", missingParameters);
                return;
            }

            // if we came this far then we could resolve all constructor parameters, so let's construct that view model
            log.debug("Constructing", viewModel[0].name, "with parameters:", viewModelParameters);
            return new viewModelClass(constructorParameters);
        };

        // map any additional view model bindings we might need to make
        var additionalBindings = {};
        _.each(OCTOPRINT_ADDITIONAL_BINDINGS, function(bindings) {
            var viewModelId = bindings[0];
            var viewModelBindTargets = bindings[1];
            if (!_.isArray(viewModelBindTargets)) {
                viewModelBindTargets = [viewModelBindTargets];
            }

            if (!additionalBindings.hasOwnProperty(viewModelId)) {
                additionalBindings[viewModelId] = viewModelBindTargets;
            } else {
                additionalBindings[viewModelId] = additionalBindings[viewModelId].concat(viewModelBindTargets);
            }
        });

        // helper for translating the name of a view model class into an identifier for the view model map
        var _getViewModelId = function(viewModel){
            var name = viewModel[0].name;
            return name.substr(0, 1).toLowerCase() + name.substr(1); // FooBarViewModel => fooBarViewModel
        };

        // instantiation loop, will make multiple passes over the list of unprocessed view models until all
        // view models have been successfully instantiated with all of their dependencies or no changes can be made
        // any more which means not all view models can be instantiated due to missing dependencies
        var unprocessedViewModels = OCTOPRINT_VIEWMODELS.slice();
        unprocessedViewModels = unprocessedViewModels.concat(ADDITIONAL_VIEWMODELS);

        var allViewModels = [];
        var allViewModelData = [];
        var pass = 1;
        log.info("Starting dependency resolution...");
        while (unprocessedViewModels.length > 0) {
            log.debug("Dependency resolution, pass #" + pass);
            var startLength = unprocessedViewModels.length;
            var postponed = [];

            // now try to instantiate every one of our as of yet unprocessed view model descriptors
            while (unprocessedViewModels.length > 0){
                var viewModel = unprocessedViewModels.shift();
                var viewModelId = _getViewModelId(viewModel);

                // make sure that we don't have two view models going by the same name
                if (_.has(viewModelMap, viewModelId)) {
                    log.error("Duplicate name while instantiating " + viewModelId);
                    continue;
                }

                var viewModelInstance = _createViewModelInstance(viewModel, viewModelMap);

                // our view model couldn't yet be instantiated, so postpone it for a bit
                if (viewModelInstance === undefined) {
                    postponed.push(viewModel);
                    continue;
                }

                // we could resolve the depdendencies and the view model is not defined yet => add it, it's now fully processed
                var viewModelBindTargets = viewModel[2];
                if (!_.isArray(viewModelBindTargets)) {
                    viewModelBindTargets = [viewModelBindTargets];
                }

                if (additionalBindings.hasOwnProperty(viewModelId)) {
                    viewModelBindTargets = viewModelBindTargets.concat(additionalBindings[viewModelId]);
                }

                allViewModelData.push([viewModelInstance, viewModelBindTargets]);
                allViewModels.push(viewModelInstance);
                viewModelMap[viewModelId] = viewModelInstance;
            }

            // anything that's now in the postponed list has to be readded to the unprocessedViewModels
            unprocessedViewModels = unprocessedViewModels.concat(postponed);

            // if we still have the same amount of items in our list of unprocessed view models it means that we
            // couldn't instantiate any more view models over a whole iteration, which in turn mean we can't resolve the
            // dependencies of remaining ones, so log that as an error and then quit the loop
            if (unprocessedViewModels.length == startLength) {
                log.error("Could not instantiate the following view models due to unresolvable dependencies:");
                _.each(unprocessedViewModels, function(entry) {
                    log.error(entry[0].name + " (missing: " + _.filter(entry[1], function(id) { return !_.has(viewModelMap, id); }).join(", ") + " )");
                });
                break;
            }

            log.debug("Dependency resolution pass #" + pass + " finished, " + unprocessedViewModels.length + " view models left to process");
            pass++;
        }
        log.info("... dependency resolution done");

        var dataUpdater = new DataUpdater(allViewModels);

        //~~ Custom knockout.js bindings

        ko.bindingHandlers.popover = {
            init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                var val = ko.utils.unwrapObservable(valueAccessor());

                var options = {
                    title: val.title,
                    animation: val.animation,
                    placement: val.placement,
                    trigger: val.trigger,
                    delay: val.delay,
                    content: val.content,
                    html: val.html
                };
                $(element).popover(options);
            }
        };

        ko.bindingHandlers.allowBindings = {
            init: function (elem, valueAccessor) {
                return { controlsDescendantBindings: !valueAccessor() };
            }
        };
        ko.virtualElements.allowedBindings.allowBindings = true;

        ko.bindingHandlers.slimScrolledForeach = {
            init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                return ko.bindingHandlers.foreach.init(element, valueAccessor(), allBindings, viewModel, bindingContext);
            },
            update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                setTimeout(function() {
                    $(element).slimScroll({scrollBy: 0});
                }, 10);
                return ko.bindingHandlers.foreach.update(element, valueAccessor(), allBindings, viewModel, bindingContext);
            }
        };

        ko.bindingHandlers.qrcode = {
            update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                var val = ko.utils.unwrapObservable(valueAccessor());

                var defaultOptions = {
                    text: "",
                    size: 200,
                    fill: "#000",
                    background: null,
                    label: "",
                    fontname: "sans",
                    fontcolor: "#000",
                    radius: 0,
                    ecLevel: "L"
                };

                var options = {};
                _.each(defaultOptions, function(value, key) {
                    options[key] = ko.utils.unwrapObservable(val[key]) || value;
                });

                $(element).empty().qrcode(options);
            }
        };

        ko.bindingHandlers.invisible = {
            init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
                if (!valueAccessor()) return;
                ko.bindingHandlers.style.update(element, function() {
                    return { visibility: 'hidden' };
                })
            }
        };

        ko.bindingHandlers.contextMenu = {
            init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                var val = ko.utils.unwrapObservable(valueAccessor());

                $(element).contextMenu(val);
            },
            update: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
                var val = ko.utils.unwrapObservable(valueAccessor());

                $(element).contextMenu(val);
            }
        };

        // Originally from Knockstrap
        // https://github.com/faulknercs/Knockstrap/blob/master/src/bindings/toggleBinding.js
        // License: MIT
        ko.bindingHandlers.toggle = {
            init: function (element, valueAccessor) {
                var value = valueAccessor();

                if (!ko.isObservable(value)) {
                    throw new Error('toggle binding should be used only with observable values');
                }

                $(element).on('click', function (event) {
                    event.preventDefault();

                    var previousValue = ko.utils.unwrapObservable(value);
                    value(!previousValue);
                });
            },

            update: function (element, valueAccessor) {
                ko.utils.toggleDomNodeCssClass(element, 'active', ko.utils.unwrapObservable(valueAccessor()));
            }
        };

        //~~ some additional hooks and initializations

        // make sure modals max out at the window height
        $.fn.modal.defaults.maxHeight = function(){
            // subtract the height of the modal header and footer
            return $(window).height() - 165;
        };

        // jquery plugin to select all text in an element
        // originally from: http://stackoverflow.com/a/987376
        $.fn.selectText = function() {
            var doc = document;
            var element = this[0];
            var range, selection;

            if (doc.body.createTextRange) {
                range = document.body.createTextRange();
                range.moveToElementText(element);
                range.select();
            } else if (window.getSelection) {
                selection = window.getSelection();
                range = document.createRange();
                range.selectNodeContents(element);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };

        $.fn.isChildOf = function (element) {
            return $(element).has(this).length > 0;
        };

        // from http://jsfiddle.net/KyleMit/X9tgY/
        $.fn.contextMenu = function (settings) {
            return this.each(function () {
                // Open context menu
                $(this).on("contextmenu", function (e) {
                    // return native menu if pressing control
                    if (e.ctrlKey) return;

                    $(settings.menuSelector)
                        .data("invokedOn", $(e.target))
                        .data("contextParent", $(this))
                        .show()
                        .css({
                            position: "fixed",
                            left: getMenuPosition(e.clientX, 'width', 'scrollLeft'),
                            top: getMenuPosition(e.clientY, 'height', 'scrollTop'),
                            "z-index": 9999
                        }).off('click')
                        .on('click', function (e) {
                            if (e.target.tagName.toLowerCase() == "input")
                                return;

                            $(this).hide();

                            settings.menuSelected.call(this, $(this).data('invokedOn'), $(this).data('contextParent'), $(e.target));
                        });

                    return false;
                });

                //make sure menu closes on any click
                $(document).click(function () {
                    $(settings.menuSelector).hide();
                });
            });

            function getMenuPosition(mouse, direction, scrollDir) {
                var win = $(window)[direction](),
                    scroll = $(window)[scrollDir](),
                    menu = $(settings.menuSelector)[direction](),
                    position = mouse + scroll;

                // opening menu would pass the side of the page
                if (mouse + menu > win && menu < mouse)
                    position -= menu;

                return position;
            }
        };

        // Use bootstrap tabdrop for tabs and pills
        $('.nav-pills, .nav-tabs').tabdrop();

        // Allow components to react to tab change
        var onTabChange = function(current, previous) {
            log.debug("Selected RaionPi tab changed: previous = " + previous + ", current = " + current);
            tabTracking.selectedTab = current;

            _.each(allViewModels, function(viewModel) {
                if (viewModel.hasOwnProperty("onTabChange")) {
                    viewModel.onTabChange(current, previous);
                }
            });
        };

        var tabs = $('#tabs a[data-toggle="tab"]');
        tabs.on('show', function (e) {
            var current = e.target.hash;
            var previous = e.relatedTarget.hash;
            onTabChange(current, previous);
        });

        tabs.on('shown', function (e) {
            var current = e.target.hash;
            var previous = e.relatedTarget.hash;

            _.each(allViewModels, function(viewModel) {
                if (viewModel.hasOwnProperty("onAfterTabChange")) {
                    viewModel.onAfterTabChange(current, previous);
                }
            });
        });

        onTabChange(OCTOPRINT_INITIAL_TAB);

        // Fix input element click problems on dropdowns
        $(".dropdown input, .dropdown label").click(function(e) {
            e.stopPropagation();
        });

        // prevent default action for drag-n-drop
        $(document).bind("drop dragover", function (e) {
            e.preventDefault();
        });

        // reload overlay
        $("#reloadui_overlay_reload").click(function() { location.reload(); });

        //~~ Starting up the app

        _.each(allViewModels, function(viewModel) {
            if (viewModel.hasOwnProperty("onStartup")) {
                viewModel.onStartup();
            }
        });

        //~~ view model binding

        var bindViewModels = function() {
            log.info("Going to bind " + allViewModelData.length + " view models...");
            _.each(allViewModelData, function(viewModelData) {
                if (!Array.isArray(viewModelData) || viewModelData.length != 2) {
                    return;
                }

                var viewModel = viewModelData[0];
                var targets = viewModelData[1];

                if (targets === undefined) {
                    return;
                }

                if (!_.isArray(targets)) {
                    targets = [targets];
                }

                if (viewModel.hasOwnProperty("onBeforeBinding")) {
                    viewModel.onBeforeBinding();
                }

                if (targets != undefined) {
                    if (!_.isArray(targets)) {
                        targets = [targets];
                    }

                    _.each(targets, function(target) {
                        if (target == undefined) {
                            return;
                        }

                        var object;
                        if (!(target instanceof jQuery)) {
                            object = $(target);
                        } else {
                            object = target;
                        }

                        if (object == undefined || !object.length) {
                            log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                            return;
                        }

                        var element = object.get(0);
                        if (element == undefined) {
                            log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                            return;
                        }

                        try {
                            ko.applyBindings(viewModel, element);
                            log.debug("View model", viewModel.constructor.name, "bound to", target);
                        } catch (exc) {
                            log.error("Could not bind view model", viewModel.constructor.name, "to target", target, ":", (exc.stack || exc));
                        }
                    });
                }

                if (viewModel.hasOwnProperty("onAfterBinding")) {
                    viewModel.onAfterBinding();
                }
            });

            _.each(allViewModels, function(viewModel) {
                if (viewModel.hasOwnProperty("onAllBound")) {
                    viewModel.onAllBound(allViewModels);
                }
            });
            log.info("... binding done");

            // startup complete
            _.each(allViewModels, function(viewModel) {
                if (viewModel.hasOwnProperty("onStartupComplete")) {
                    viewModel.onStartupComplete();
                }
            });

            // make sure we can track the browser tab visibility
            tabTracking.onBrowserVisibilityChange(function(status) {
                log.debug("Browser tab is now " + (status ? "visible" : "hidden"));
                _.each(allViewModels, function(viewModel) {
                    if (viewModel.hasOwnProperty("onBrowserTabVisibilityChange")) {
                        viewModel.onBrowserTabVisibilityChange(status);
                    }
                });
            });
        };

        if (!_.has(viewModelMap, "settingsViewModel")) {
            throw new Error("settingsViewModel is missing, can't run UI")
        }
        viewModelMap["settingsViewModel"].requestData(bindViewModels);
    }
);


;
