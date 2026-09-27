import type { ComponentType } from "react";
import Allocator from "./allocator";
import Channels from "./channels";
import Defer from "./defer";
import Escape from "./escape";
import Gc from "./gc";
import Interfaces from "./interfaces";
import Maps from "./maps";
import Pipeline from "./pipeline";
import Scheduler from "./scheduler";
import Slices from "./slices";
import Stacks from "./stacks";
import Strings from "./strings";
import Structs from "./structs";

export const BODIES: Record<string, ComponentType> = {
  slices: Slices,
  maps: Maps,
  strings: Strings,
  structs: Structs,
  pipeline: Pipeline,
  escape: Escape,
  interfaces: Interfaces,
  scheduler: Scheduler,
  stacks: Stacks,
  defer: Defer,
  channels: Channels,
  allocator: Allocator,
  gc: Gc,
};
