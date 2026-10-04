// The centre tab is an action: its press opens /spend and never navigates here. This file exists only
// because a bar item needs a route. Anyone who reaches /add anyway (typed by hand, or a cmd-click on the
// bar item) lands on the Kitty, which is a screen with a tab bar — not a modal with no way back.
import { Redirect } from 'expo-router';

export default function Add() {
  return <Redirect href="/" />;
}
