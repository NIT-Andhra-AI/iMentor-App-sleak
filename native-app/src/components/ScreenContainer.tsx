import React from 'react';
import { View, ViewStyle, StyleProp, ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  ignoreTop?: boolean;
  ignoreBottom?: boolean;
  ignoreHorizontal?: boolean;
}

export default function ScreenContainer({
  children,
  style,
  ignoreTop = false,
  ignoreBottom = false,
  ignoreHorizontal = false,
  ...rest
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: '#0A0A0A',
          paddingTop: ignoreTop ? 0 : insets.top,
          paddingBottom: ignoreBottom ? 0 : insets.bottom,
          paddingHorizontal: ignoreHorizontal ? 0 : 20,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
