/**
 * @file TopBarAppIcon.js
 * @module shell.ui.topBar.TopBarAppIcon
 *
 * Displays either the active media application's icon or album-art thumbnail.
 *
 * TopBarButton owns this component and supplies the selected display style. It
 * keeps app-icon resolution and asynchronous artwork loading isolated from the
 * rest of the top-bar layout.
 */

import GdkPixbuf from "gi://GdkPixbuf";
import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { IconNames } from "../../../shared/constants/icons.js";
import { TopBarImageStyles } from "../../../shared/enums/topBar.js";
import { createLogger } from "../../../shared/utils/log.js";
import AlbumArtLoader from "../../services/AlbumArtLoader.js";
import MediaAppResolver, {
  FALLBACK_MEDIA_APP_ICON_NAME,
} from "../../services/MediaAppResolver.js";
import { isCancellationError } from "../../utils/errors.js";
import { createIcon, setGIcon } from "../../utils/icons.js";

const THUMBNAIL_SIZE = 20;
const logger = createLogger("TopBarAppIcon");

if (typeof GdkPixbuf?.Pixbuf?.new_from_stream_at_scale_async === "function") {
  Gio._promisify(
    GdkPixbuf.Pixbuf,
    "new_from_stream_at_scale_async",
    "new_from_stream_finish",
  );
}

/**
 * Displays either the active media application's icon or album-art thumbnail.
 */
export default class TopBarAppIcon {
  constructor(topBarButton) {
    this.topBarButton = topBarButton;
    this.actor = null;
    this.iconKey = null;
    this.imageStyle = null;
    this.usesColoredIcon = null;
    this.thumbnailLoadGeneration = 0;
    this.thumbnailLoadCancellable = null;
    this.albumArtLoader = AlbumArtLoader.getInstance();
    this.mediaAppResolver = MediaAppResolver.getInstance();
    this.fallbackThumbnailIcon = Gio.ThemedIcon.new_from_names([
      IconNames.MEDIA,
      IconNames.MISSING,
    ]);
  }

  render(index, parentBox) {
    const imageStyle = this.topBarButton.extensionController.topBarImageStyle;
    if (imageStyle === TopBarImageStyles.ALBUM_ART) {
      this.renderThumbnail(index, parentBox);
      return;
    }

    this.renderAppIcon(index, parentBox);
  }

  renderAppIcon(index, parentBox) {
    const identity = this.topBarButton.mediaApp.identity;
    const desktopEntry = this.topBarButton.mediaApp.desktopEntry;
    const useColoredIcon =
      this.topBarButton.extensionController.topBarAppIconUseColor;
    const iconKey = `${this.topBarButton.mediaApp.busName}\u0001${identity}\u0001${desktopEntry}`;

    this.cancelThumbnailLoad();
    if (
      !this.actor ||
      this.imageStyle !== TopBarImageStyles.APP_ICON ||
      this.usesColoredIcon !== useColoredIcon
    )
      this.replaceActor(
        index,
        `system-status-icon no-margin ${useColoredIcon ? "colored-icon" : "symbolic-icon"}`,
        FALLBACK_MEDIA_APP_ICON_NAME,
      );

    if (iconKey !== this.iconKey) {
      const app = this.mediaAppResolver.resolveMediaApp(
        identity,
        desktopEntry,
        this.topBarButton.mediaApp.busName,
      );
      setGIcon(
        this.actor,
        this.mediaAppResolver.getMediaAppIcon(app),
        FALLBACK_MEDIA_APP_ICON_NAME,
      );
      this.iconKey =
        app && this.mediaAppResolver.hasResolvedMediaAppIcon(app)
          ? iconKey
          : null;
    }

    this.imageStyle = TopBarImageStyles.APP_ICON;
    this.usesColoredIcon = useColoredIcon;
    this.attach(index, parentBox);
  }

  renderThumbnail(index, parentBox) {
    const radius =
      this.topBarButton.extensionController.topBarThumbnailCornerRadius;
    if (!this.actor || this.imageStyle !== TopBarImageStyles.ALBUM_ART)
      this.replaceActor(
        index,
        "no-margin mediashell-top-bar-thumbnail",
        IconNames.MEDIA,
      );

    this.imageStyle = TopBarImageStyles.ALBUM_ART;
    this.usesColoredIcon = null;
    this.attach(index, parentBox);

    const thumbnailKey = [
      this.topBarButton.mediaApp.busName,
      this.topBarButton.mediaApp.metadata?.["mpris:artUrl"] ?? "",
      radius,
      this.topBarButton.extensionController.albumArtCacheEnabled,
    ].join("\u0000");
    if (thumbnailKey === this.iconKey) return;

    this.cancelThumbnailLoad();
    this.iconKey = thumbnailKey;
    this.setThumbnailFallback();
    this.loadThumbnail(thumbnailKey, radius);
  }

  replaceActor(index, styleClass, fallbackIconName) {
    const previous = this.actor;
    const parent = previous?.get_parent() ?? null;
    const previousIndex = parent ? parent.get_children().indexOf(previous) : -1;

    this.actor = createIcon({ styleClass }, fallbackIconName);
    this.iconKey = null;
    if (parent) {
      parent.insert_child_at_index(
        this.actor,
        previousIndex >= 0 ? previousIndex : index,
      );
      parent.remove_child(previous);
    }
    previous?.destroy();
  }

  async loadThumbnail(thumbnailKey, radius) {
    const albumArtUri = this.topBarButton.mediaApp.metadata?.["mpris:artUrl"];
    if (!albumArtUri) return;

    const loadGeneration = ++this.thumbnailLoadGeneration;
    const loadCancellable = new Gio.Cancellable();
    this.thumbnailLoadCancellable = loadCancellable;
    try {
      const albumArtSource = await this.albumArtLoader.loadAlbumArt(
        albumArtUri,
        this.topBarButton.extensionController.albumArtCacheEnabled,
        loadCancellable,
      );
      const pixbuf = await this.decodeThumbnail(
        albumArtSource?.stream,
        loadCancellable,
      );
      if (
        !this.isCurrentThumbnailLoad(
          loadGeneration,
          loadCancellable,
          thumbnailKey,
        )
      )
        return;

      if (pixbuf) {
        setGIcon(
          this.actor,
          this.roundThumbnailCorners(pixbuf, radius * 2),
          IconNames.MEDIA,
        );
        this.actor.set_icon_size(THUMBNAIL_SIZE);
      }
    } catch (error) {
      if (
        !isCancellationError(error) &&
        this.isCurrentThumbnailLoad(
          loadGeneration,
          loadCancellable,
          thumbnailKey,
        )
      )
        logger.debugOnce(
          `thumbnail:${this.topBarButton.mediaApp.busName}`,
          "Top-bar album-art thumbnail could not be loaded",
          error,
        );
    } finally {
      if (
        this.isCurrentThumbnailLoad(
          loadGeneration,
          loadCancellable,
          thumbnailKey,
        )
      )
        this.thumbnailLoadCancellable = null;
    }
  }

  async decodeThumbnail(stream, loadCancellable) {
    if (!stream) return null;
    if (
      typeof GdkPixbuf?.Pixbuf?.new_from_stream_at_scale_async !== "function"
    ) {
      this.closeStream(stream);
      return null;
    }

    try {
      return await GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
        stream,
        THUMBNAIL_SIZE * 2,
        THUMBNAIL_SIZE * 2,
        true,
        loadCancellable,
      );
    } finally {
      this.closeStream(stream);
    }
  }

  roundThumbnailCorners(pixbuf, radius) {
    if (radius <= 0) return pixbuf;

    const source = pixbuf.get_has_alpha()
      ? pixbuf
      : pixbuf.add_alpha(false, 0, 0, 0);
    const width = source.get_width();
    const height = source.get_height();
    const cornerRadius = Math.min(
      Math.floor(radius),
      Math.floor(width / 2),
      Math.floor(height / 2),
    );
    if (cornerRadius <= 0) return source;

    const rowstride = source.get_rowstride();
    const channels = source.get_n_channels();
    const pixels = new Uint8Array(source.get_pixels());
    const radiusSquared = (cornerRadius - 0.5) ** 2;
    for (const [startX, startY, centerX, centerY] of [
      [0, 0, cornerRadius - 0.5, cornerRadius - 0.5],
      [width - cornerRadius, 0, width - cornerRadius + 0.5, cornerRadius - 0.5],
      [
        0,
        height - cornerRadius,
        cornerRadius - 0.5,
        height - cornerRadius + 0.5,
      ],
      [
        width - cornerRadius,
        height - cornerRadius,
        width - cornerRadius + 0.5,
        height - cornerRadius + 0.5,
      ],
    ]) {
      for (let y = startY; y < startY + cornerRadius; y++) {
        for (let x = startX; x < startX + cornerRadius; x++) {
          const deltaX = x - centerX;
          const deltaY = y - centerY;
          if (deltaX * deltaX + deltaY * deltaY > radiusSquared)
            pixels[y * rowstride + x * channels + 3] = 0;
        }
      }
    }
    return GdkPixbuf.Pixbuf.new_from_bytes(
      GLib.Bytes.new(pixels),
      source.get_colorspace(),
      source.get_has_alpha(),
      source.get_bits_per_sample(),
      width,
      height,
      rowstride,
    );
  }

  isCurrentThumbnailLoad(loadGeneration, loadCancellable, thumbnailKey) {
    return (
      this.actor &&
      this.imageStyle === TopBarImageStyles.ALBUM_ART &&
      loadGeneration === this.thumbnailLoadGeneration &&
      !loadCancellable.is_cancelled() &&
      this.iconKey === thumbnailKey
    );
  }

  closeStream(stream) {
    if (!stream) return;
    try {
      stream.close(null);
    } catch (error) {
      logger.debugOnce(
        "thumbnail-stream-close",
        "Thumbnail stream was already closed",
        error,
      );
    }
  }

  cancelThumbnailLoad() {
    if (!this.thumbnailLoadCancellable) return;
    this.thumbnailLoadGeneration++;
    this.thumbnailLoadCancellable.cancel();
    this.thumbnailLoadCancellable = null;
  }

  setThumbnailFallback() {
    if (!this.actor) return;
    setGIcon(this.actor, this.fallbackThumbnailIcon, IconNames.MEDIA);
    this.actor.set_icon_size(THUMBNAIL_SIZE);
  }

  attach(index, parentBox) {
    const parent = this.actor.get_parent();
    const currentIndex =
      parent === parentBox ? parentBox.get_children().indexOf(this.actor) : -1;
    if (currentIndex === index) return;

    parent?.remove_child(this.actor);
    parentBox.insert_child_at_index(this.actor, index);
  }

  remove() {
    this.cancelThumbnailLoad();
    this.iconKey = null;
    this.imageStyle = null;
    this.usesColoredIcon = null;
    if (!this.actor) return;

    this.actor.get_parent()?.remove_child(this.actor);
    this.actor.destroy();
    this.actor = null;
  }

  destroy() {
    this.remove();
    this.albumArtLoader = null;
    this.mediaAppResolver = null;
    this.fallbackThumbnailIcon = null;
    this.topBarButton = null;
  }
}
