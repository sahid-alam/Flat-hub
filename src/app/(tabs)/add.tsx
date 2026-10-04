// The centre tab is an action: its press opens /spend and never navigates here. This file exists only
// because a bar item needs a route, and it catches anyone who types /add by hand.
import { Redirect } from 'expo-router';

export default function Add() {
  return <Redirect href="/spend" />;
}
