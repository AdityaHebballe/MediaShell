/**
 * @file PreferenceSensitivityController.js
 * @module prefs.groups.PreferenceSensitivityController
 *
 * Keeps dependent preferences sensitive only when their parent toggles allow them.
 *
 * This controller watches the small set of settings that enable or disable
 * nested controls such as visualizer options and album-art rows. It owns no
 * persistent values; it only mirrors current settings into widget sensitivity.
 */

import { createLogger } from "../../shared/utils/log.js";
import {
  connectOwnedSignal,
  disconnectOwnedSignals,
} from "../utils/SignalConnections.js";

const logger = createLogger("PreferenceSensitivityController");

/**
 * Keeps dependent preferences sensitive only when their parent toggles allow them.
 */
export default class PreferenceSensitivityController {
  constructor(builder) {
    this.builder = builder;
    this.ownedSignalConnections = [];
  }

  init() {
    this.topBarTrackInformationRow = this.builder.get_object(
      "er-top-bar-track-information",
    );
    this.topBarTrackInformationScrollEnabledRow = this.builder.get_object(
      "sr-top-bar-track-information-scroll-enabled",
    );
    this.topBarTrackInformationScrollEnabledSwitch = this.builder.get_object(
      "sw-top-bar-track-information-scroll-enabled",
    );
    this.topBarTrackInformationScrollSpeedRow = this.builder.get_object(
      "sp-top-bar-track-information-scroll-speed",
    );
    this.topBarScrollPauseRow = this.builder.get_object(
      "sp-top-bar-track-information-scroll-pause-time",
    );
    this.topBarTrackInformationContentRow = this.builder.get_object(
      "er-top-bar-track-information-content",
    );
    this.popupTrackInformationRow = this.builder.get_object(
      "er-popup-track-information",
    );
    this.popupTrackInformationContentRow = this.builder.get_object(
      "er-popup-track-information-content",
    );
    this.popupTrackInformationScrollEnabledRow = this.builder.get_object(
      "sr-popup-track-information-scroll-enabled",
    );
    this.popupTrackInformationScrollEnabledSwitch = this.builder.get_object(
      "sw-popup-track-information-scroll-enabled",
    );
    this.popupTrackInformationScrollSpeedRow = this.builder.get_object(
      "sp-popup-track-information-scroll-speed",
    );
    this.popupScrollPauseRow = this.builder.get_object(
      "sp-popup-track-information-scroll-pause-time",
    );

    this.connectOwnedSignal(
      this.topBarTrackInformationRow,
      "notify::enable-expansion",
      () => this.updateScrollingSensitivity(),
    );
    this.connectOwnedSignal(
      this.popupTrackInformationRow,
      "notify::enable-expansion",
      () => this.updateScrollingSensitivity(),
    );
    this.connectOwnedSignal(
      this.topBarTrackInformationScrollEnabledSwitch,
      "notify::active",
      () => this.updateScrollingSensitivity(),
    );
    this.connectOwnedSignal(
      this.popupTrackInformationScrollEnabledSwitch,
      "notify::active",
      () => this.updateScrollingSensitivity(),
    );
    this.visualizerRow = this.builder.get_object("er-top-bar-visualizer");
    this.visualizerStyleRow = this.builder.get_object(
      "cr-top-bar-visualizer-style",
    );
    this.visualizerSpeedRow = this.builder.get_object(
      "sp-top-bar-visualizer-speed",
    );
    this.connectOwnedSignal(
      this.visualizerRow,
      "notify::enable-expansion",
      () => this.updateVisualizerSensitivity(),
    );
    this.topBarAppIconRow = this.builder.get_object("er-top-bar-app-icon");
    this.topBarImageStyleRow = this.builder.get_object(
      "cr-top-bar-image-style",
    );
    this.topBarAppIconColorRow = this.builder.get_object(
      "sr-top-bar-app-icon-use-color",
    );
    this.topBarThumbnailCornerRadiusRow = this.builder.get_object(
      "sp-top-bar-thumbnail-corner-radius",
    );
    this.connectOwnedSignal(
      this.topBarAppIconRow,
      "notify::enable-expansion",
      () => this.updateTopBarImageSensitivity(),
    );
    this.connectOwnedSignal(this.topBarImageStyleRow, "notify::selected", () =>
      this.updateTopBarImageSensitivity(),
    );

    this.updateScrollingSensitivity();
    this.updateVisualizerSensitivity();
    this.updateTopBarImageSensitivity();
  }

  updateScrollingSensitivity() {
    const topBarScrollingEnabled =
      this.topBarTrackInformationRow.enableExpansion &&
      this.topBarTrackInformationScrollEnabledSwitch.active;
    this.topBarTrackInformationScrollSpeedRow.sensitive =
      topBarScrollingEnabled;
    this.topBarScrollPauseRow.sensitive = topBarScrollingEnabled;
    this.topBarTrackInformationContentRow.sensitive =
      this.topBarTrackInformationRow.enableExpansion;

    const popupScrollingEnabled =
      this.popupTrackInformationRow.enableExpansion &&
      this.popupTrackInformationScrollEnabledSwitch.active;
    this.popupTrackInformationScrollSpeedRow.sensitive = popupScrollingEnabled;
    this.popupScrollPauseRow.sensitive = popupScrollingEnabled;
    this.popupTrackInformationContentRow.sensitive =
      this.popupTrackInformationRow.enableExpansion;
  }

  updateVisualizerSensitivity() {
    const visualizerEnabled = this.visualizerRow.enableExpansion;
    this.visualizerStyleRow.sensitive = visualizerEnabled;
    this.visualizerSpeedRow.sensitive = visualizerEnabled;
  }

  updateTopBarImageSensitivity() {
    const imageEnabled = this.topBarAppIconRow.enableExpansion;
    const usesAlbumArt = this.topBarImageStyleRow.selected === 1;
    this.topBarAppIconColorRow.sensitive = imageEnabled && !usesAlbumArt;
    this.topBarThumbnailCornerRadiusRow.sensitive =
      imageEnabled && usesAlbumArt;
  }

  connectOwnedSignal(object, signal, callback) {
    connectOwnedSignal(this.ownedSignalConnections, object, signal, callback);
  }

  destroy() {
    disconnectOwnedSignals(this.ownedSignalConnections, (error) => {
      logger.debug(
        "A preference sensitivity signal was already disconnected",
        error,
      );
    });
    this.builder = null;
    this.topBarTrackInformationRow = null;
    this.topBarTrackInformationScrollEnabledRow = null;
    this.topBarTrackInformationScrollEnabledSwitch = null;
    this.topBarTrackInformationScrollSpeedRow = null;
    this.topBarScrollPauseRow = null;
    this.topBarTrackInformationContentRow = null;
    this.popupTrackInformationRow = null;
    this.popupTrackInformationContentRow = null;
    this.popupTrackInformationScrollEnabledRow = null;
    this.popupTrackInformationScrollEnabledSwitch = null;
    this.popupTrackInformationScrollSpeedRow = null;
    this.popupScrollPauseRow = null;
    this.visualizerRow = null;
    this.visualizerStyleRow = null;
    this.visualizerSpeedRow = null;
    this.topBarAppIconRow = null;
    this.topBarImageStyleRow = null;
    this.topBarAppIconColorRow = null;
    this.topBarThumbnailCornerRadiusRow = null;
  }
}
