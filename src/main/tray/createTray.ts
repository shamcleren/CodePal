import { Menu, Tray, nativeImage } from "electron";

/** 从设计稿裁出的黑色模板图，适合 macOS Tray 自动跟随明暗主题 */
const TRAY_TEMPLATE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABmUlEQVR4nO3WvWsUURTG4SfZ+IGFXwQsBBtTRC0iWmkI6axFsLAySNKmSikEq9gKwdZ/QMFCSCMoJIqSRtIsxEKjlbDBrygixElx7hAJK7kDOyvo/mCY4c6dc86877l3hh49/nf62owN1pyzVXP8arRToN1YJylqjt9dGhhQv2pt+StJdyYfwxUc2jFeG/3Yl86ToqEKrOAA9ghLusKKWNNv8UWoUZn+ivOG8ABX8TSN78c6PuMhpoUVWXbkFlAGvItRrOE7juCYkP4TVnEHZ4U1jcz42YWuYgrjtv3fTOdnac4GLqXrXQvIUaAvJTguur2FWbzGK/zEAi6mxGu4kJM8lzLQgni7k/iRCnmOeSynImeEQgXOp+dybf4jpf8n8AHXcRsv8BgTWBINOIw3uIW9OmRBkQp4JxrtsJD9FE7jJprCnq84iMU0Z1eqroKPuCa8v48nwpIRnME9HE2FdpSy0HNC7hu/3XsveqEpNqU5XfpADQiPW3iJb7ic7mWvgKr7dqlEgV/paAoVHol9ouFf++no0aNWtgCV41F51/w44gAAAABJRU5ErkJggg==",
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
