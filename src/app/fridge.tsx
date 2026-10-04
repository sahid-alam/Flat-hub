// The fridge now lives on the Kitchen tab. The old path stays deep-linkable and lands on its segment.
import { Redirect } from 'expo-router';

export default function Fridge() {
  return <Redirect href={{ pathname: '/kitchen', params: { seg: 'fridge' } }} />;
}
