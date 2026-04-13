import { Menu, Tray, nativeImage } from "electron";

/** 从设计稿裁出的黑色模板图，适合 macOS Tray 自动跟随明暗主题 */
const TRAY_TEMPLATE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAABr0lEQVRYhe3WPWsVQRQG4MevaKOJjSDXNFaKiKCdYiNqo13ws7Sy878Igjb6E65aiQRENL25iYKihaAIFkb8CBHUWMxZXcLu3tlFtNkXhtk9nPecd87snFl69Ojxn7Euw2cal3EYWzPjfsYcruNNN2kJF7GM1Y5jGReaEjRV4DjuYQOe4BbeZQrfiUs4gB84gQeZ3N9YkFYxxKa25ODciRjzdU51FdiLZ5L6aWnlO3AU68ck/olHeI8BXktV3IPnuepPh/IyYVb+3s+WeC/Cdqoq0cYaAZtj/layDTGVuYBh6Xkl5i1tBFThGh5Kx+pjcK9Kq7uC7yFwFxZbxK3ETAQelWxnw1YEP+RPyQ+G7Wm8nynxRmGbqUrUpgKra+Z5qSpFkirfzqiqAOzDZANvMnzK+GsVgLfSMdw+xicbdWe6+PrLX+5NLOHDmLEUvtbEWFGBOgGvYt4ttdWuGEQMeNmWXOzdbUyEbUoqf9MoesUE7urYiuEY7kttdCRdRrn7O5Auo/1Sfzipw2UE5/FV9+v4C841Jcj5IRlIPyRHsC1T+Cc8xg0tT0WPHj3+OX4BE2SHzae8av0AAAAASUVORK5CYII=",
  "base64",
);

type CreateTrayOptions = {
  onOpenMain: () => void;
  onOpenSettings: () => void;
};

function createTrayIcon() {
  const icon = nativeImage.createFromBuffer(TRAY_TEMPLATE_PNG);
  icon.setTemplateImage(true);
  return icon;
}

export function createTray(options: CreateTrayOptions): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip("CodePal");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 CodePal", click: options.onOpenMain },
      { label: "设置", click: options.onOpenSettings },
      { type: "separator" },
      { label: "Quit CodePal", role: "quit" },
    ]),
  );
  return tray;
}
