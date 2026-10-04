// The shopping list now lives on the Kitchen tab. The old path stays deep-linkable.
import { Redirect } from 'expo-router';

export default function Shopping() {
  return <Redirect href={{ pathname: '/kitchen', params: { seg: 'shopping' } }} />;
}
