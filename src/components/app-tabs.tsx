import { useColorScheme } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  const dark = useColorScheme() === 'dark';
  return (
    <NativeTabs
      backgroundColor={dark ? '#1b1b1e' : '#ffffff'}
      indicatorColor="#c9f24e"
      labelStyle={{ color: dark ? '#9a9aa3' : '#6b6b74', selected: { color: dark ? '#c9f24e' : '#4d7c0f' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="manage">
        <NativeTabs.Trigger.Label>Manage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/explore.png')} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}