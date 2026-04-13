import { Menu, Tray, nativeImage } from "electron";

/** 38px @2x 黑色模板图，适合 macOS Tray 自动跟随明暗主题 */
const TRAY_TEMPLATE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACYAAAAmCAYAAACoPemuAAAABmJLR0QA/wD/AP+gvaeTAAACNklEQVRYhe3YTW/NQRTH8U81WEmQpsXC7UIaDfEQFrosFl0IG6SKkAgLr0Kir0HYCm+C0LISG5FKLCpB0i5aRUNEKo1rMfefNlfn/9x2018yuYtz5sz3zsw995xhQ2uv7dhcd9COgv4HcA5D6EUPtrRs3zGJMTxpfTZroUzRWUy0Fso73uEaNq0GUD/GCwK1j3E06oQ6JRxPFahkfMOxOqAu4U9NUMl4URXqOH7nXOwXPmIGfzN856pAdeFzxgKvcBO72ubuwHnxOzlWBex+CtA8huVLMZdb/sncrzhSFqoXCxGoKSGHFVE3bgm721UWCh5EoBZwokrgKuoUtnslsLs1xO8T0s9hBRPuQARqXrjUZXVa+AdYHnMaN/IGuBMBe1gB6iIWI3Fzn8TjyOSRklDd+JEC1RTy3kAsQHLe7Tkp0fuSYFewLcOnA7djxgSsJ2KfLQEFR6v6JWDNiL1ovZYoFi+3XwI2E7HHdjJLb6r6ZYHtL4SzpEf4meHTxL2YMQGbjNiHSkDBFyFXLab4jAoFQapWK8EO4m1bzClczxugU6iXVoIbrQCWaB9O4pASPUCs5FmQkgjXQg3xsmcaBwvGq63sIbtQHLEOhSLhm31KgWvitbATe9rm7sQFvIzMq1RaU64Zmc3hW6kZSTQsft/KjsrtW6JBoVGtA6q2hjdRH55VhHqOvXVCLdcZ/2fwrDGBq0o+qhQta/otPUM1sBtbW7Y5fBB+fU8tNb7rplV5uNtQUf0DO0ZurmWs3yQAAAAASUVORK5CYII=",
  "base64",
);

type CreateTrayOptions = {
  onOpenMain: () => void;
  onOpenSettings: () => void;
};

function createTrayIcon() {
  const icon = nativeImage.createFromBuffer(TRAY_TEMPLATE_PNG, { scaleFactor: 2 });
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
