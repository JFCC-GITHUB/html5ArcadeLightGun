extends Node2D

enum GameState { START_SCREEN, DIFFICULTY_SELECT, STORY_CUTSCENE, PLAYING, WAVE_CLEAR, GAME_OVER }

var current_state = GameState.START_SCREEN
var selected_difficulty = "medium" # easy | medium | hard

# Story & Configuration
var story_title = "THE SALOON SIEGE"
var story_text = "The year is 1888. Black Bart's gang has overtaken Red Canyon! They've barricaded the Saloon and taken hostages. Grab your revolvers, Sheriff - shoot fast, shoot straight, and save the town!"

var clip_size = 6
var max_lives = 3
var starting_lives = 3

var difficulty_multipliers = {
	"easy": { "name": "EASY (GREENHORN)", "target_mult": 1.3, "spawn_mult": 1.2, "lives": 5 },
	"medium": { "name": "MEDIUM (GUNSLINGER)", "target_mult": 1.0, "spawn_mult": 1.0, "lives": 3 },
	"hard": { "name": "HARD (DESPERADO)", "target_mult": 0.75, "spawn_mult": 0.8, "lives": 2 }
}

var score = 0
var high_score = 0
var lives = 3
var ammo = 6
var is_reloading = false
var combo_streak = 0

var current_wave_index = 0
var wave_time_left = 30.0
var spawn_timer = 0.0

var crosshair_pos = Vector2(512, 384)
var active_targets = []
var bullet_holes = []
var particles = []
var floating_texts = []

var recoil_offset = 0.0
var muzzle_flash_timer = 0.0
var damage_flash_timer = 0.0
var screen_shake_amount = 0.0

var covers = [
	{ "id": "window_top_left", "x": 235, "y": 190, "w": 70, "h": 90 },
	{ "id": "window_top_right", "x": 715, "y": 190, "w": 70, "h": 90 },
	{ "id": "door_bottom_left", "x": 195, "y": 430, "w": 80, "h": 120 },
	{ "id": "door_bottom_right", "x": 749, "y": 430, "w": 80, "h": 120 },
	{ "id": "balcony_center", "x": 472, "y": 250, "w": 80, "h": 100 }
]

var waves = [
	{
		"stage": "STAGE 1: SALOON FRONT",
		"name": "Wave 1: Dusty Outskirts",
		"duration_sec": 30,
		"spawn_interval_ms": 1400,
		"target_visible_duration_ms": 2200,
		"points_outlaw": 100,
		"points_civilian_penalty": 200,
		"outlaw_ratio": 0.8
	},
	{
		"stage": "STAGE 2: BANK VAULT SIEGE",
		"name": "Wave 2: High Noon Showdown",
		"duration_sec": 30,
		"spawn_interval_ms": 1000,
		"target_visible_duration_ms": 1600,
		"points_outlaw": 150,
		"points_civilian_penalty": 250,
		"outlaw_ratio": 0.7
	},
	{
		"stage": "STAGE 3: TRAIN ROBBERY",
		"name": "Wave 3: Outlaw Rampage",
		"duration_sec": 35,
		"spawn_interval_ms": 750,
		"target_visible_duration_ms": 1200,
		"points_outlaw": 200,
		"points_civilian_penalty": 300,
		"outlaw_ratio": 0.65
	},
	{
		"stage": "STAGE 4: OUTLAW HIDEOUT",
		"name": "Wave 4: Black Bart's Revenge",
		"duration_sec": 40,
		"spawn_interval_ms": 600,
		"target_visible_duration_ms": 1000,
		"points_outlaw": 300,
		"points_civilian_penalty": 400,
		"outlaw_ratio": 0.6
	}
]

var audio_players = {}

func _ready():
	load_toml_config()
	setup_audio()
	queue_redraw()

func parse_toml_val(val_str: String):
	if val_str.begins_with("\"") and val_str.ends_with("\""):
		return val_str.substr(1, val_str.length() - 2)
	elif val_str.is_valid_float():
		return val_str.to_float()
	elif val_str.is_valid_int():
		return val_str.to_int()
	return val_str

func load_toml_config():
	var file_path = "res://config/scenes.toml"
	if not FileAccess.file_exists(file_path):
		return

	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		return

	var text = file.get_as_text()
	file.close()

	parse_simple_toml(text)
	ammo = clip_size
	lives = starting_lives

func parse_simple_toml(text: String):
	var current_section = ""
	var lines = text.split("\n")
	var temp_covers = []
	var temp_waves = []
	var current_item = {}

	for raw_line in lines:
		var line = raw_line.strip_edges()
		if line.is_empty() or line.begins_with("#"):
			continue

		if line.begins_with("[[covers]]"):
			if not current_item.is_empty() and current_section == "covers":
				temp_covers.append(current_item)
			current_item = {}
			current_section = "covers"
			continue
		elif line.begins_with("[[waves]]"):
			if not current_item.is_empty() and current_section == "waves":
				temp_waves.append(current_item)
			current_item = {}
			current_section = "waves"
			continue
		elif line.begins_with("[") and line.ends_with("]"):
			if not current_item.is_empty():
				if current_section == "covers":
					temp_covers.append(current_item)
				elif current_section == "waves":
					temp_waves.append(current_item)
				current_item = {}
			current_section = line.substr(1, line.length() - 2)
			continue

		var parts = line.split("=", false, 1)
		if parts.size() == 2:
			var key = parts[0].strip_edges()
			var val = parse_toml_val(parts[1].strip_edges())

			if current_section == "game":
				if key == "clip_size": clip_size = int(val)
				elif key == "starting_lives": starting_lives = int(val)
			elif current_section == "story":
				if key == "title": story_title = str(val)
				elif key == "text": story_text = str(val)
			elif current_section == "covers" or current_section == "waves":
				current_item[key] = val

	if not current_item.is_empty():
		if current_section == "covers":
			temp_covers.append(current_item)
		elif current_section == "waves":
			temp_waves.append(current_item)

	if temp_covers.size() > 0:
		covers.clear()
		for c in temp_covers:
			covers.append({
				"id": c.get("id", ""),
				"x": int(c.get("x", 0)),
				"y": int(c.get("y", 0)),
				"w": int(c.get("width", 70)),
				"h": int(c.get("height", 90))
			})

	if temp_waves.size() > 0:
		waves.clear()
		for w in temp_waves:
			waves.append({
				"stage": str(w.get("stage", "STAGE 1")),
				"name": str(w.get("name", "Wave")),
				"duration_sec": int(w.get("duration_sec", 30)),
				"spawn_interval_ms": int(w.get("spawn_interval_ms", 1500)),
				"target_visible_duration_ms": int(w.get("target_visible_duration_ms", 2000)),
				"points_outlaw": int(w.get("points_outlaw", 100)),
				"points_civilian_penalty": int(w.get("points_civilian_penalty", 200)),
				"outlaw_ratio": float(w.get("outlaw_ratio", 0.75))
			})

func setup_audio():
	var sfx_dict = {
		"shoot": generate_gunshot_wav(),
		"dry_fire": generate_dry_fire_wav(),
		"reload": generate_reload_wav(),
		"hit_outlaw": generate_hit_outlaw_wav(),
		"hit_civilian": generate_hit_civilian_wav(),
		"hurt": generate_hurt_wav()
	}

	for sfx_name in sfx_dict.keys():
		var p = AudioStreamPlayer.new()
		p.stream = sfx_dict[sfx_name]
		add_child(p)
		audio_players[sfx_name] = p

func play_sfx(sfx_name: String):
	if audio_players.has(sfx_name):
		var p = audio_players[sfx_name]
		if p and p.stream:
			p.play()

func generate_gunshot_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.25
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / float(num_samples)
		var envelope = exp(-t * 12.0)
		var noise = (randf() * 2.0 - 1.0) * envelope
		var val = int(clamp(noise * 127.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func generate_dry_fire_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.05
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		var freq = 800.0 - t * 10000.0
		var square = 1.0 if fmod(t * freq, 1.0) < 0.5 else -1.0
		var envelope = (1.0 - t / duration)
		var val = int(clamp(square * envelope * 80.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func generate_reload_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.35
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		var click_phase = fmod(t, 0.1)
		var val = 0
		if click_phase < 0.04:
			var env = (1.0 - click_phase / 0.04)
			var sig = sin(t * 2000.0 * TAU) * env
			val = int(clamp(sig * 100.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func generate_hit_outlaw_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.2
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		var freq = 523.25 if t < 0.1 else 659.25
		var sig = sin(t * freq * TAU) * (1.0 - t / duration)
		var val = int(clamp(sig * 110.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func generate_hit_civilian_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.3
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		var freq = 220.0 - t * 100.0
		var saw = (fmod(t * freq, 1.0) * 2.0 - 1.0)
		var env = (1.0 - t / duration)
		var val = int(clamp(saw * env * 110.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func generate_hurt_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.25
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		var freq = 150.0 - t * 300.0
		var saw = (fmod(t * freq, 1.0) * 2.0 - 1.0)
		var env = (1.0 - t / duration)
		var val = int(clamp(saw * env * 120.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.data = byte_array
	return wav

func start_new_game():
	score = 0
	var diff_settings = difficulty_multipliers[selected_difficulty]
	lives = diff_settings["lives"]
	combo_streak = 0
	current_wave_index = 0
	start_wave(0)

func start_wave(idx):
	current_wave_index = idx
	var w = waves[idx] if idx < waves.size() else waves[0]
	wave_time_left = float(w["duration_sec"])
	spawn_timer = 0.0
	ammo = clip_size
	is_reloading = false
	active_targets.clear()
	bullet_holes.clear()
	particles.clear()
	floating_texts.clear()
	current_state = GameState.PLAYING

func _input(event):
	if event is InputEventMouseMotion:
		crosshair_pos = event.position
		queue_redraw()
	elif event is InputEventScreenTouch and event.pressed:
		crosshair_pos = event.position
		handle_action_at_pos(event.position)
		queue_redraw()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		crosshair_pos = event.position
		handle_action_at_pos(event.position)
		queue_redraw()
	elif event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
		reload()
		queue_redraw()

func handle_action_at_pos(pos: Vector2):
	if current_state == GameState.START_SCREEN:
		current_state = GameState.DIFFICULTY_SELECT
		play_sfx("reload")
		return
	elif current_state == GameState.DIFFICULTY_SELECT:
		# Check difficulty selection boxes
		if pos.x >= 212 and pos.x <= 812:
			if pos.y >= 300 and pos.y <= 360:
				selected_difficulty = "easy"
				current_state = GameState.STORY_CUTSCENE
				play_sfx("shoot")
			elif pos.y >= 380 and pos.y <= 440:
				selected_difficulty = "medium"
				current_state = GameState.STORY_CUTSCENE
				play_sfx("shoot")
			elif pos.y >= 460 and pos.y <= 520:
				selected_difficulty = "hard"
				current_state = GameState.STORY_CUTSCENE
				play_sfx("shoot")
		return
	elif current_state == GameState.STORY_CUTSCENE:
		start_new_game()
		return
	elif current_state == GameState.WAVE_CLEAR:
		if current_wave_index + 1 < waves.size():
			start_wave(current_wave_index + 1)
		else:
			current_state = GameState.DIFFICULTY_SELECT
		return
	elif current_state == GameState.GAME_OVER:
		current_state = GameState.DIFFICULTY_SELECT
		return

	if pos.x >= 1024 - 160 and pos.y >= 768 - 60:
		reload()
		return

	shoot(pos)

func add_hit_particles(pos: Vector2, color: Color, count: int = 15):
	for i in range(count):
		var angle = randf() * TAU
		var speed = randf_range(80.0, 220.0)
		particles.append({
			"pos": pos,
			"vel": Vector2(cos(angle), sin(angle)) * speed,
			"color": color,
			"life": 0.35,
			"max_life": 0.35,
			"size": randf_range(3.0, 6.0)
		})

func add_floating_text(text: String, pos: Vector2, color: Color, font_size: int = 22):
	floating_texts.append({
		"text": text,
		"pos": pos,
		"color": color,
		"life": 0.7,
		"max_life": 0.7,
		"font_size": font_size
	})

func shoot(pos: Vector2):
	if is_reloading or ammo <= 0:
		play_sfx("dry_fire")
		return

	ammo -= 1
	play_sfx("shoot")
	recoil_offset = 18.0
	muzzle_flash_timer = 0.07

	bullet_holes.append({ "pos": pos, "time": Time.get_ticks_msec() })

	var hit_index = -1
	for i in range(active_targets.size() - 1, -1, -1):
		var t = active_targets[i]
		var rect = Rect2(t["x"], t["y"], t["w"], t["h"])
		if rect.has_point(pos):
			hit_index = i
			var curr_wave = waves[current_wave_index]

			if t["type"] == "outlaw" or t["type"] == "fast_outlaw":
				combo_streak += 1
				var is_headshot = (pos.y < t["y"] + t["h"] * 0.35)
				var bonus = 100 if is_headshot else (50 if t["type"] == "fast_outlaw" else 0)
				var pts = int(curr_wave["points_outlaw"]) + bonus + (combo_streak * 20)
				score += pts
				if score > high_score:
					high_score = score

				add_hit_particles(pos, Color("f1c40f") if is_headshot else Color("e74c3c"), 20)

				if is_headshot:
					add_floating_text("HEADSHOT! +" + str(pts), pos + Vector2(-40, -10), Color("f1c40f"), 26)
				elif combo_streak > 1:
					add_floating_text(str(combo_streak) + "x COMBO! +" + str(pts), pos + Vector2(-30, -10), Color("e67e22"), 22)
				else:
					add_floating_text("+" + str(pts), pos + Vector2(-20, -10), Color("ffffff"), 20)

				play_sfx("hit_outlaw")
			else:
				# Hit Civilian
				combo_streak = 0
				var penalty = int(curr_wave["points_civilian_penalty"])
				score = max(0, score - penalty)

				add_hit_particles(pos, Color("27ae60"), 20)
				add_floating_text("NOOO! CIVILIAN HIT -" + str(penalty), pos + Vector2(-80, -10), Color("e74c3c"), 24)
				play_sfx("hit_civilian")

				damage_flash_timer = 0.15
				screen_shake_amount = 8.0
			break

	if hit_index != -1:
		active_targets.remove_at(hit_index)
	else:
		add_hit_particles(pos, Color("7f8c8d"), 6)

func reload():
	if current_state != GameState.PLAYING or is_reloading or ammo == clip_size:
		return
	is_reloading = true
	play_sfx("reload")
	get_tree().create_timer(0.4).timeout.connect(func():
		ammo = clip_size
		is_reloading = false
		queue_redraw()
	)

func _process(delta):
	if recoil_offset > 0.0:
		recoil_offset = max(0.0, recoil_offset - delta * 120.0)

	if muzzle_flash_timer > 0.0:
		muzzle_flash_timer = max(0.0, muzzle_flash_timer - delta)

	if damage_flash_timer > 0.0:
		damage_flash_timer = max(0.0, damage_flash_timer - delta)

	if screen_shake_amount > 0.0:
		screen_shake_amount = max(0.0, screen_shake_amount - delta * 30.0)

	for i in range(particles.size() - 1, -1, -1):
		var p = particles[i]
		p["pos"] += p["vel"] * delta
		p["life"] -= delta
		if p["life"] <= 0:
			particles.remove_at(i)

	for i in range(floating_texts.size() - 1, -1, -1):
		var ft = floating_texts[i]
		ft["pos"].y -= delta * 50.0
		ft["life"] -= delta
		if ft["life"] <= 0:
			floating_texts.remove_at(i)

	var now_msec = Time.get_ticks_msec()
	for i in range(bullet_holes.size() - 1, -1, -1):
		if now_msec - bullet_holes[i]["time"] > 5000:
			bullet_holes.remove_at(i)

	if current_state != GameState.PLAYING:
		queue_redraw()
		return

	var curr_wave = waves[current_wave_index]

	wave_time_left -= delta
	if wave_time_left <= 0.0:
		current_state = GameState.WAVE_CLEAR
		queue_redraw()
		return

	var diff_settings = difficulty_multipliers[selected_difficulty]
	spawn_timer += delta * 1000.0
	if spawn_timer >= float(curr_wave["spawn_interval_ms"]) * float(diff_settings["spawn_mult"]):
		spawn_timer = 0.0
		spawn_target()

	for i in range(active_targets.size() - 1, -1, -1):
		var t = active_targets[i]
		t["timer"] -= delta * 1000.0
		t["anim_timer"] = min(150.0, t["anim_timer"] + delta * 1000.0)

		if t["timer"] <= 0.0:
			if t["type"] == "outlaw" or t["type"] == "fast_outlaw":
				lives -= 1
				combo_streak = 0
				damage_flash_timer = 0.25
				screen_shake_amount = 14.0
				play_sfx("hurt")
				if lives <= 0:
					current_state = GameState.GAME_OVER
			active_targets.remove_at(i)

	queue_redraw()

func spawn_target():
	if active_targets.size() >= 3:
		return

	var occupied = {}
	for t in active_targets:
		occupied[t["cover_id"]] = true

	var free_covers = []
	for c in covers:
		if not occupied.has(c["id"]):
			free_covers.append(c)

	if free_covers.size() == 0:
		return

	var sel = free_covers[randi() % free_covers.size()]
	var curr_wave = waves[current_wave_index]
	var diff_settings = difficulty_multipliers[selected_difficulty]
	var is_outlaw = randf() < float(curr_wave["outlaw_ratio"])
	var t_type = "civilian"
	if is_outlaw:
		t_type = "fast_outlaw" if randf() < 0.3 else "outlaw"

	var visible_duration = float(curr_wave["target_visible_duration_ms"]) * float(diff_settings["target_mult"])

	active_targets.append({
		"cover_id": sel["id"],
		"x": sel["x"],
		"y": sel["y"],
		"w": sel["w"],
		"h": sel["h"],
		"type": t_type,
		"timer": visible_duration,
		"anim_timer": 0.0
	})

func _draw():
	if screen_shake_amount > 0.0:
		var offset = Vector2(randf_range(-1.0, 1.0), randf_range(-1.0, 1.0)) * screen_shake_amount
		draw_set_transform(offset)

	draw_background()
	draw_targets()
	draw_bullet_holes()
	draw_particles()
	draw_gun_overlay()

	if muzzle_flash_timer > 0.0:
		draw_muzzle_flash()

	draw_crosshair()
	draw_floating_texts()
	draw_hud()

	if damage_flash_timer > 0.0:
		draw_rect(Rect2(0, 0, 1024, 768), Color(0.9, 0.1, 0.1, 0.35))

	if current_state != GameState.PLAYING:
		draw_overlay_screens()

func draw_background():
	draw_rect(Rect2(0, 0, 1024, 350), Color("e67e22"))
	var pts = PackedVector2Array([
		Vector2(0, 350), Vector2(80, 280), Vector2(200, 280),
		Vector2(300, 350), Vector2(550, 310), Vector2(700, 310),
		Vector2(850, 350), Vector2(1024, 320), Vector2(1024, 350)
	])
	draw_colored_polygon(pts, Color("78281f"))

	draw_rect(Rect2(0, 350, 1024, 418), Color("5c2c16"))

	draw_rect(Rect2(180, 120, 664, 460), Color("4a2511"))
	for py in range(140, 580, 20):
		draw_line(Vector2(180, py), Vector2(844, py), Color("311709"), 2.0)

	draw_rect(Rect2(165, 105, 694, 20), Color("271207"))
	draw_rect(Rect2(360, 75, 304, 40), Color("f39c12"))
	draw_rect(Rect2(360, 75, 304, 40), Color("271207"), false, 4.0)
	draw_string(ThemeDB.fallback_font, Vector2(512 - 70, 103), "- SALOON -", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("271207"))

	draw_rect(Rect2(170, 280, 684, 16), Color("311709"))
	for rx in range(180, 844, 30):
		draw_rect(Rect2(rx, 240, 6, 40), Color("5c2c16"))

	draw_rect(Rect2(235, 190, 70, 90), Color("170b04"))
	draw_rect(Rect2(715, 190, 70, 90), Color("170b04"))
	draw_rect(Rect2(195, 430, 80, 120), Color("170b04"))
	draw_rect(Rect2(749, 430, 80, 120), Color("170b04"))

	draw_barrel(Vector2(380, 460))
	draw_barrel(Vector2(590, 460))

func draw_barrel(pos: Vector2):
	draw_rect(Rect2(pos.x, pos.y, 50, 70), Color("6e3c1b"))
	draw_rect(Rect2(pos.x, pos.y + 10, 50, 6), Color("3a539b"))
	draw_rect(Rect2(pos.x, pos.y + 54, 50, 6), Color("3a539b"))
	draw_rect(Rect2(pos.x, pos.y, 50, 70), Color("271207"), false, 2.0)

func draw_targets():
	for t in active_targets:
		var pop_ratio = clamp(t["anim_timer"] / 150.0, 0.0, 1.0)
		var render_y = t["y"] + t["h"] * (1.0 - pop_ratio)
		var visible_h = t["h"] * pop_ratio

		var pos = Vector2(t["x"], render_y)
		var size = Vector2(t["w"], visible_h)

		if t["type"] == "outlaw":
			draw_detailed_outlaw(pos, size, pop_ratio)
		elif t["type"] == "fast_outlaw":
			draw_detailed_fast_outlaw(pos, size, pop_ratio)
		else:
			draw_detailed_civilian(pos, size, pop_ratio)

func draw_detailed_outlaw(pos: Vector2, size: Vector2, pop_ratio: float):
	var cx = pos.x + size.x / 2.0
	var top = pos.y

	if pop_ratio > 0.15:
		var hat_brim = PackedVector2Array([
			Vector2(cx - 34, top + 18), Vector2(cx, top + 10), Vector2(cx + 34, top + 18),
			Vector2(cx + 30, top + 24), Vector2(cx, top + 16), Vector2(cx - 30, top + 24)
		])
		draw_colored_polygon(hat_brim, Color("3e1f0c"))
		draw_rect(Rect2(cx - 18, top + 2, 36, 14), Color("4a2511"))
		draw_rect(Rect2(cx - 18, top + 13, 36, 3), Color("b03a2e"))

	if pop_ratio > 0.25:
		draw_rect(Rect2(cx - 15, top + 18, 30, 26), Color("f5cba7"))
		draw_line(Vector2(cx - 13, top + 21), Vector2(cx - 3, top + 24), Color("1c2833"), 3.0)
		draw_line(Vector2(cx + 3, top + 24), Vector2(cx + 13, top + 21), Color("1c2833"), 3.0)
		draw_circle(Vector2(cx - 7, top + 26), 2.5, Color("e74c3c"))
		draw_circle(Vector2(cx + 7, top + 26), 2.5, Color("e74c3c"))
		var bandana = PackedVector2Array([
			Vector2(cx - 16, top + 30), Vector2(cx + 16, top + 30),
			Vector2(cx + 11, top + 46), Vector2(cx, top + 50), Vector2(cx - 11, top + 46)
		])
		draw_colored_polygon(bandana, Color("c0392b"))

	if pop_ratio > 0.45:
		draw_rect(Rect2(cx - 20, top + 46, 40, 40), Color("283747"))
		draw_rect(Rect2(cx - 24, top + 46, 12, 40), Color("78281f"))
		draw_rect(Rect2(cx + 12, top + 46, 12, 40), Color("78281f"))
		draw_rect(Rect2(cx + 22, top + 40, 22, 7), Color("515a5a"))
		draw_rect(Rect2(cx + 20, top + 45, 7, 14), Color("3e1f0c"))

func draw_detailed_fast_outlaw(pos: Vector2, size: Vector2, pop_ratio: float):
	var cx = pos.x + size.x / 2.0
	var top = pos.y

	if pop_ratio > 0.15:
		draw_rect(Rect2(cx - 36, top + 14, 72, 7), Color("17202a"))
		draw_rect(Rect2(cx - 20, top + 0, 40, 16), Color("1c2833"))
		draw_rect(Rect2(cx - 20, top + 13, 40, 3), Color("f1c40f"))

	if pop_ratio > 0.25:
		draw_rect(Rect2(cx - 15, top + 18, 30, 26), Color("edbb99"))
		draw_line(Vector2(cx - 15, top + 20), Vector2(cx + 15, top + 26), Color("17202a"), 2.0)
		draw_rect(Rect2(cx - 11, top + 22, 9, 9), Color("17202a"))
		draw_circle(Vector2(cx + 7, top + 25), 2.5, Color("f1c40f"))
		var mustache = PackedVector2Array([
			Vector2(cx - 14, top + 34), Vector2(cx + 14, top + 34), Vector2(cx, top + 39)
		])
		draw_colored_polygon(mustache, Color("3e1f0c"))

	if pop_ratio > 0.45:
		draw_rect(Rect2(cx - 24, top + 42, 48, 44), Color("1a5276"))
		draw_rect(Rect2(cx - 32, top + 36, 14, 7), Color("7f8c8d"))
		draw_rect(Rect2(cx + 18, top + 36, 14, 7), Color("7f8c8d"))

func draw_detailed_civilian(pos: Vector2, size: Vector2, pop_ratio: float):
	var cx = pos.x + size.x / 2.0
	var top = pos.y

	if pop_ratio > 0.15:
		draw_circle(Vector2(cx, top + 16), 20.0, Color("f4d03f"))

	if pop_ratio > 0.25:
		draw_rect(Rect2(cx - 14, top + 16, 28, 24), Color("f5cba7"))
		draw_circle(Vector2(cx - 7, top + 22), 3.5, Color("2980b9"))
		draw_circle(Vector2(cx + 7, top + 22), 3.5, Color("2980b9"))
		draw_circle(Vector2(cx, top + 32), 4.5, Color("78281f"))

	if pop_ratio > 0.45:
		draw_rect(Rect2(cx - 22, top + 38, 44, 44), Color("27ae60"))
		draw_rect(Rect2(cx - 12, top + 42, 24, 40), Color("ffffff"))
		draw_rect(Rect2(cx - 28, top + 10, 9, 30), Color("f5cba7"))
		draw_rect(Rect2(cx + 19, top + 10, 9, 30), Color("f5cba7"))

func draw_particles():
	for p in particles:
		var alpha = p["life"] / p["max_life"]
		var col = Color(p["color"].r, p["color"].g, p["color"].b, alpha)
		draw_circle(p["pos"], p["size"], col)

func draw_floating_texts():
	var font = ThemeDB.fallback_font
	for ft in floating_texts:
		var alpha = ft["life"] / ft["max_life"]
		var col = Color(ft["color"].r, ft["color"].g, ft["color"].b, alpha)
		draw_string(font, ft["pos"], ft["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, ft["font_size"], col)

func draw_bullet_holes():
	for h in bullet_holes:
		draw_circle(h["pos"], 4.0, Color("17202a"))
		draw_arc(h["pos"], 6.0, 0, TAU, 8, Color("7f8c8d"), 1.0)

func draw_gun_overlay():
	var gun_x = 512.0
	var gun_y = 768.0 + recoil_offset

	draw_rect(Rect2(gun_x - 16, gun_y - 140, 32, 120), Color("34495e"))
	draw_rect(Rect2(gun_x - 4, gun_y - 150, 8, 12), Color("e74c3c"))
	draw_rect(Rect2(gun_x - 28, gun_y - 40, 56, 50), Color("2c3e50"))
	draw_rect(Rect2(gun_x - 22, gun_y + 10, 44, 40), Color("6e3c1b"))

func draw_muzzle_flash():
	draw_circle(crosshair_pos, 35.0, Color("f1c40f"))
	draw_circle(crosshair_pos, 18.0, Color("ffffff"))

func draw_crosshair():
	draw_arc(crosshair_pos, 12.0, 0, TAU, 16, Color("e74c3c"), 2.0)
	draw_line(crosshair_pos - Vector2(16, 0), crosshair_pos - Vector2(8, 0), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos + Vector2(8, 0), crosshair_pos + Vector2(16, 0), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos - Vector2(0, 16), crosshair_pos - Vector2(0, 8), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos + Vector2(0, 8), crosshair_pos + Vector2(0, 16), Color("e74c3c"), 2.0)
	draw_rect(Rect2(crosshair_pos - Vector2(1, 1), Vector2(2, 2)), Color("f1c40f"))

func draw_heart_icon(pos: Vector2, scale_factor: float = 1.0):
	# Drawing a fancy vector heart icon
	var red = Color("e74c3c")
	var dark_red = Color("922b21")
	# Left & Right heart circles
	draw_circle(pos + Vector2(-5 * scale_factor, -3 * scale_factor), 6.0 * scale_factor, red)
	draw_circle(pos + Vector2(5 * scale_factor, -3 * scale_factor), 6.0 * scale_factor, red)
	# Bottom heart triangle tip
	var tri = PackedVector2Array([
		pos + Vector2(-11 * scale_factor, -2 * scale_factor),
		pos + Vector2(11 * scale_factor, -2 * scale_factor),
		pos + Vector2(0 * scale_factor, 11 * scale_factor)
	])
	draw_colored_polygon(tri, red)

func draw_hud():
	draw_rect(Rect2(0, 0, 1024, 54), Color(0.1, 0.05, 0.01, 0.88))
	draw_rect(Rect2(0, 0, 1024, 54), Color("c85a17"), false, 3.0)

	var font = ThemeDB.fallback_font
	draw_string(font, Vector2(15, 34), "SCORE: " + str(score), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("f1c40f"))
	draw_string(font, Vector2(160, 34), "HIGH: " + str(high_score), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("f1c40f"))

	var curr_wave = waves[current_wave_index] if current_wave_index < waves.size() else waves[0]
	draw_string(font, Vector2(362, 34), curr_wave["stage"], HORIZONTAL_ALIGNMENT_CENTER, 300, 18, Color("ffffff"))

	# Fancy Vector Heart Icons for Lives/HP
	draw_string(font, Vector2(710, 34), "HP:", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("e74c3c"))
	for i in range(lives):
		draw_heart_icon(Vector2(765 + i * 26, 28), 1.0)

	var time_col = Color("e74c3c") if wave_time_left <= 5.0 else Color("2ecc71")
	draw_string(font, Vector2(880, 34), "TIME: " + str(int(ceil(wave_time_left))) + "s", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, time_col)

	# Ammo bar
	var ammo_y = 768 - 45
	draw_rect(Rect2(10, ammo_y, 220, 36), Color(0.1, 0.05, 0.01, 0.85))
	draw_rect(Rect2(10, ammo_y, 220, 36), Color("c85a17"), false, 2.0)

	for i in range(clip_size):
		if i < ammo:
			draw_rect(Rect2(20 + i * 28, ammo_y + 6, 14, 22), Color("f39c12"))
		else:
			draw_rect(Rect2(20 + i * 28, ammo_y + 6, 14, 22), Color("7f8c8d"), false, 1.0)

	if is_reloading:
		draw_string(font, Vector2(512 - 70, 580), "RELOADING...", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("e74c3c"))
	elif ammo == 0:
		draw_string(font, Vector2(512 - 200, 580), "PRESS SPACE OR TAP HERE TO RELOAD!", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("f1c40f"))

	draw_rect(Rect2(1024 - 160, 768 - 60, 150, 50), Color(0.75, 0.22, 0.17, 0.85))
	draw_rect(Rect2(1024 - 160, 768 - 60, 150, 50), Color("ffffff"), false, 2.0)
	draw_string(font, Vector2(1024 - 140, 768 - 28), "RELOAD", HORIZONTAL_ALIGNMENT_CENTER, -1, 18, Color("ffffff"))

func draw_overlay_screens():
	var font = ThemeDB.fallback_font
	draw_rect(Rect2(0, 0, 1024, 768), Color(0.05, 0.02, 0.01, 0.92))

	if current_state == GameState.START_SCREEN:
		draw_string(font, Vector2(512 - 280, 260), "WILD WEST LIGHT GUN ARCADE", HORIZONTAL_ALIGNMENT_CENTER, -1, 32, Color("f1c40f"))
		draw_string(font, Vector2(512 - 250, 340), "AIM & SHOOT OUTLAWS | SPARE CIVILIANS", HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(512 - 230, 380), "SPACE OR ON-SCREEN BUTTON TO RELOAD", HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color("ffffff"))

		draw_rect(Rect2(312, 460, 400, 60), Color("c0392b"))
		draw_rect(Rect2(312, 460, 400, 60), Color("ffffff"), false, 3.0)
		draw_string(font, Vector2(512 - 140, 500), "CLICK / TAP TO START", HORIZONTAL_ALIGNMENT_CENTER, -1, 26, Color("ffffff"))

	elif current_state == GameState.DIFFICULTY_SELECT:
		draw_string(font, Vector2(512 - 180, 220), "SELECT DIFFICULTY LEVEL", HORIZONTAL_ALIGNMENT_CENTER, -1, 30, Color("f1c40f"))

		var diff_options = [
			{ "id": "easy", "label": "EASY (GREENHORN - 5 LIVES)", "y": 300, "col": Color("2ecc71") },
			{ "id": "medium", "label": "MEDIUM (GUNSLINGER - 3 LIVES)", "y": 380, "col": Color("f39c12") },
			{ "id": "hard", "label": "HARD (DESPERADO - 2 LIVES)", "y": 460, "col": Color("e74c3c") }
		]

		for opt in diff_options:
			var box_col = Color("2c3e50") if selected_difficulty != opt["id"] else opt["col"]
			draw_rect(Rect2(212, opt["y"], 600, 60), box_col)
			draw_rect(Rect2(212, opt["y"], 600, 60), Color("ffffff"), false, 2.0)
			draw_string(font, Vector2(512 - 220, opt["y"] + 38), opt["label"], HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color("ffffff"))

	elif current_state == GameState.STORY_CUTSCENE:
		draw_rect(Rect2(112, 160, 800, 440), Color(0.12, 0.06, 0.02, 0.95))
		draw_rect(Rect2(112, 160, 800, 440), Color("f39c12"), false, 4.0)

		draw_string(font, Vector2(512 - 140, 220), "- " + story_title + " -", HORIZONTAL_ALIGNMENT_CENTER, -1, 28, Color("f1c40f"))

		# Split story text into lines
		draw_string(font, Vector2(160, 290), "The year is 1888. Black Bart's gang has overtaken Red Canyon!", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(160, 330), "They've barricaded the Saloon and taken innocent hostages.", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(160, 370), "Grab your revolvers, Sheriff - shoot fast, shoot straight,", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(160, 410), "and save the town from destruction!", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("ffffff"))

		draw_rect(Rect2(362, 510, 300, 50), Color("e74c3c"))
		draw_rect(Rect2(362, 510, 300, 50), Color("ffffff"), false, 2.0)
		draw_string(font, Vector2(512 - 100, 542), "CLICK TO DRAW GUN!", HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color("ffffff"))

	elif current_state == GameState.WAVE_CLEAR:
		draw_string(font, Vector2(512 - 150, 280), "STAGE CLEARED!", HORIZONTAL_ALIGNMENT_CENTER, -1, 38, Color("2ecc71"))
		draw_string(font, Vector2(512 - 140, 360), "CURRENT SCORE: " + str(score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("f1c40f"))
		draw_string(font, Vector2(512 - 180, 480), "CLICK / TAP FOR NEXT STAGE", HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color("ffffff"))

	elif current_state == GameState.GAME_OVER:
		draw_string(font, Vector2(512 - 140, 260), "GAME OVER", HORIZONTAL_ALIGNMENT_CENTER, -1, 44, Color("e74c3c"))
		draw_string(font, Vector2(512 - 120, 340), "FINAL SCORE: " + str(score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("ffffff"))
		draw_string(font, Vector2(512 - 110, 380), "HIGH SCORE: " + str(high_score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("ffffff"))
		draw_string(font, Vector2(512 - 150, 480), "CLICK / TAP TO RESTART", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("f1c40f"))
