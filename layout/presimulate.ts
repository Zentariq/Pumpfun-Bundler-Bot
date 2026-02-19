import { screen_clear } from "../menu/menu";
import { tokenLaunchWaiting } from "../src/msgLog";
import { presimulateLaunch } from "./createTokenBuy";

export const presimulate = async () => {
  screen_clear();
  await presimulateLaunch();
  tokenLaunchWaiting();
};
