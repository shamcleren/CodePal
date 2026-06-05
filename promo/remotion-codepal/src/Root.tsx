import { Composition } from "remotion";
import { CodePalPromo } from "./CodePalPromo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="CodePalPromo"
      component={CodePalPromo}
      durationInFrames={540}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
