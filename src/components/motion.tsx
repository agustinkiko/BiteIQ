import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring
} from "react-native-reanimated";

import { motion } from "@/config/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far the target sinks while held. Large surfaces want less. */
  pressedScale?: number;
};

/** A Pressable that physically gives under the finger, then springs back. */
export function PressableScale({ style, pressedScale = 0.97, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        scale.value = withSpring(pressedScale, motion.press);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, motion.press);
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}

/**
 * Staggered entrance: content rises and fades in, one beat after the item
 * before it. Pass the item's position on screen as `index`.
 */
export function Reveal({ index = 0, style, children }: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.base + 160).delay(index * motion.stagger)} style={style}>
      {children}
    </Animated.View>
  );
}

/**
 * Counts a number toward `target` with an ease-out, starting from zero on
 * mount and from the previous value on change. Returns the target unchanged
 * when the system asks for reduced motion.
 */
export function useCountUp(target: number, duration: number = motion.fill) {
  const reduceMotion = useReducedMotion();
  const current = useRef(reduceMotion ? target : 0);
  const [value, setValue] = useState(current.current);

  useEffect(() => {
    if (reduceMotion || typeof requestAnimationFrame !== "function") {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduceMotion, target]);

  return value;
}
