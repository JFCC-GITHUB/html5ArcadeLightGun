import { parse } from 'smol-toml';

const DEFAULT_CONFIG = {
  game: {
    title: "Wild West Arcade Light Gun",
    clip_size: 6,
    max_lives: 3,
    starting_lives: 3
  },
  mechanics: {
    recoil_duration_ms: 100,
    recoil_distance_px: 18,
    muzzle_flash_ms: 70,
    bullet_hole_duration_ms: 5000
  },
  covers: [
    { id: "window_top_left", x: 240, y: 200, width: 60, height: 80, label: "Balcony Left Window" },
    { id: "window_top_right", x: 724, y: 200, width: 60, height: 80, label: "Balcony Right Window" },
    { id: "door_bottom_left", x: 200, y: 440, width: 70, height: 110, label: "Saloon Left Door" },
    { id: "door_bottom_right", x: 754, y: 440, width: 70, height: 110, label: "Saloon Right Door" },
    { id: "balcony_center", x: 480, y: 260, width: 64, height: 90, label: "Balcony Center" }
  ],
  waves: [
    {
      id: 1,
      name: "Wave 1: Dusty Outskirts",
      duration_sec: 30,
      spawn_interval_ms: 1500,
      target_visible_duration_ms: 2200,
      points_outlaw: 100,
      points_civilian_penalty: 200,
      outlaw_ratio: 0.8
    },
    {
      id: 2,
      name: "Wave 2: High Noon Showdown",
      duration_sec: 30,
      spawn_interval_ms: 1100,
      target_visible_duration_ms: 1600,
      points_outlaw: 150,
      points_civilian_penalty: 250,
      outlaw_ratio: 0.7
    },
    {
      id: 3,
      name: "Wave 3: Outlaw Rampage",
      duration_sec: 35,
      spawn_interval_ms: 800,
      target_visible_duration_ms: 1200,
      points_outlaw: 200,
      points_civilian_penalty: 300,
      outlaw_ratio: 0.65
    }
  ]
};

export async function loadConfig() {
  try {
    const res = await fetch('config/scenes.toml');
    if (res.ok) {
      const text = await res.text();
      const parsed = parse(text);
      console.log('Loaded TOML config successfully:', parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('Could not fetch config/scenes.toml, using default fallback config:', err);
  }
  return DEFAULT_CONFIG;
}
