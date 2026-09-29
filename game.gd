extends Node2D

enum GameState { START_SCREEN, DIFFICULTY_SELECT, STORY_CUTSCENE, PLAYING, WAVE_CLEAR, GAME_OVER }

var current_state = GameState.START_SCREEN
var selected_difficulty = "medium"

# Story & Config
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
		"bg_type": "saloon",
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
		"bg_type": "bank",
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
		"bg_type": "train",
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
		"bg_type": "hideout",
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
var bgm_player: AudioStreamPlayer

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
		var bg_types = ["saloon", "bank", "train", "hideout"]
		var idx = 0
		for w in temp_waves:
			waves.append({
				"stage": str(w.get("stage", "STAGE " + str(idx + 1))),
				"bg_type": bg_types[idx % bg_types.size()],
				"name": str(w.get("name", "Wave")),
				"duration_sec": int(w.get("duration_sec", 30)),
				"spawn_interval_ms": int(w.get("spawn_interval_ms", 1500)),
				"target_visible_duration_ms": int(w.get("target_visible_duration_ms", 2000)),
				"points_outlaw": int(w.get("points_outlaw", 100)),
				"points_civilian_penalty": int(w.get("points_civilian_penalty", 200)),
				"outlaw_ratio": float(w.get("outlaw_ratio", 0.75))
			})
			idx += 1

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

	bgm_player = AudioStreamPlayer.new()
	bgm_player.stream = generate_bgm_wav()
	add_child(bgm_player)

func play_sfx(sfx_name: String):
	if audio_players.has(sfx_name):
		var p = audio_players[sfx_name]
		if p and p.stream:
			p.play()

func start_bgm():
	if bgm_player and not bgm_player.playing:
		bgm_player.play()

func stop_bgm():
	if bgm_player and bgm_player.playing:
		bgm_player.stop()

func generate_gunshot_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 0.3
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / float(num_samples)
		var envelope = exp(-t * 10.0)
		var noise = (randf() * 2.0 - 1.0) * envelope
		var bass = sin(t * 120.0 * TAU) * exp(-t * 15.0) * 0.6
		var val = int(clamp((noise + bass) * 110.0, -128.0, 127.0))
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
		var click_phase = fmod(t, 0.08)
		var val = 0
		if click_phase < 0.03:
			var env = (1.0 - click_phase / 0.03)
			var sig = sin(t * 2200.0 * TAU) * env
			val = int(clamp(sig * 110.0, -128.0, 127.0))
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

func generate_bgm_wav() -> AudioStreamWAV:
	var sample_rate = 22050
	var duration = 4.0 # 4 second loopable Western action rhythm
	var num_samples = int(sample_rate * duration)
	var byte_array = PackedByteArray()
	byte_array.resize(num_samples)

	for i in range(num_samples):
		var t = float(i) / sample_rate
		# Rhythmic drum beat (bass drum every 0.5s, snare on 0.25s offset)
		var beat = fmod(t, 0.5)
		var drum = exp(-beat * 25.0) * sin(beat * 80.0 * TAU) * 0.5

		# Western Bassline synth
		var bass_freq = 110.0 # A2
		var step = int(t * 4.0) % 4
		if step == 1: bass_freq = 130.81 # C3
		elif step == 2: bass_freq = 146.83 # D3
		elif step == 3: bass_freq = 98.0 # G2

		var bass = (fmod(t * bass_freq, 1.0) * 2.0 - 1.0) * 0.3

		var val = int(clamp((drum + bass) * 70.0, -128.0, 127.0))
		byte_array[i] = (val + 256) % 256

	var wav = AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
	wav.loop_begin = 0
	wav.loop_end = num_samples
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
	start_bgm()

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
			stop_bgm()
		return
	elif current_state == GameState.GAME_OVER:
		current_state = GameState.DIFFICULTY_SELECT
		stop_bgm()
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
		stop_bgm()
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
					stop_bgm()
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

	draw_stage_background()
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

func draw_stage_background():
	var curr_wave = waves[current_wave_index] if current_wave_index < waves.size() else waves[0]
	var bg_type = curr_wave.get("bg_type", "saloon")

	if bg_type == "bank":
		draw_bank_background()
	elif bg_type == "train":
		draw_train_background()
	elif bg_type == "hideout":
		draw_hideout_background()
	else:
		draw_saloon_background()

func draw_saloon_background():
	# Sunset Sky
	draw_rect(Rect2(0, 0, 1024, 280), Color("d35400"))
	draw_rect(Rect2(0, 180, 1024, 100), Color("e67e22"))
	# Sun
	draw_circle(Vector2(512, 220), 60.0, Color("f39c12"))

	# Red Canyon Mountains
	var mountain_pts = PackedVector2Array([
		Vector2(0, 280), Vector2(120, 180), Vector2(280, 240),
		Vector2(450, 160), Vector2(650, 220), Vector2(850, 150),
		Vector2(1024, 260), Vector2(1024, 280)
	])
	draw_colored_polygon(mountain_pts, Color("78281f"))

	# Dusty Ground
	draw_rect(Rect2(0, 280, 1024, 488), Color("8c4e2b"))

	# Wooden Saloon Structure
	draw_rect(Rect2(160, 100, 704, 480), Color("4a2511"))
	# Horizontal Wood Planks
	for py in range(120, 580, 18):
		draw_line(Vector2(160, py), Vector2(864, py), Color("2d160a"), 2.0)

	# Roof Trim & Saloon Signboard
	draw_rect(Rect2(145, 80, 734, 24), Color("271207"))
	draw_rect(Rect2(340, 50, 344, 48), Color("d68910"))
	draw_rect(Rect2(340, 50, 344, 48), Color("271207"), false, 4.0)
	draw_string(ThemeDB.fallback_font, Vector2(512 - 110, 82), "★ RED CANYON SALOON ★", HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color("271207"))

	# Balcony Railing
	draw_rect(Rect2(160, 275, 704, 16), Color("2d160a"))
	for rx in range(175, 860, 28):
		draw_rect(Rect2(rx, 235, 6, 40), Color("5c2c16"))

	# Door and Window Covers (Openings)
	draw_rect(Rect2(235, 190, 70, 90), Color("120803")) # Top Left Window
	draw_rect(Rect2(715, 190, 70, 90), Color("120803")) # Top Right Window
	draw_rect(Rect2(472, 250, 80, 100), Color("120803")) # Balcony Center Door
	draw_rect(Rect2(195, 430, 80, 120), Color("120803")) # Bottom Left Door
	draw_rect(Rect2(749, 430, 80, 120), Color("120803")) # Bottom Right Door

	# Window Frames & Shutters
	draw_rect(Rect2(231, 186, 78, 98), Color("e67e22"), false, 3.0)
	draw_rect(Rect2(711, 186, 78, 98), Color("e67e22"), false, 3.0)

	# Water Barrels & Wagon Wheel Decor
	draw_barrel(Vector2(370, 470))
	draw_barrel(Vector2(580, 470))
	draw_circle(Vector2(320, 520), 25.0, Color("3e1f0c"))
	draw_circle(Vector2(320, 520), 20.0, Color("5c2c16"))
	draw_circle(Vector2(320, 520), 6.0, Color("120803"))

func draw_bank_background():
	# Bank Vault Marble & Steel Interior Wall
	draw_rect(Rect2(0, 0, 1024, 768), Color("243342"))
	for px in range(0, 1024, 128):
		draw_line(Vector2(px, 0), Vector2(px, 768), Color("1a252f"), 2.0)

	# Gold & Money Safe Pillars
	draw_rect(Rect2(100, 80, 80, 580), Color("34495e"))
	draw_rect(Rect2(844, 80, 80, 580), Color("34495e"))
	draw_rect(Rect2(90, 70, 100, 20), Color("7f8c8d"))
	draw_rect(Rect2(834, 70, 100, 20), Color("7f8c8d"))

	# Vault Structure
	draw_rect(Rect2(180, 100, 664, 480), Color("2c3e50"))
	draw_rect(Rect2(180, 100, 664, 480), Color("7f8c8d"), false, 4.0)

	# Giant Heavy Iron Vault Door
	draw_circle(Vector2(512, 340), 130.0, Color("7f8c8d"))
	draw_circle(Vector2(512, 340), 110.0, Color("34495e"))
	draw_circle(Vector2(512, 340), 90.0, Color("2c3e50"))
	# Combination Wheel Handle & Bolts
	draw_circle(Vector2(512, 340), 32.0, Color("f39c12"))
	for i in range(6):
		var ang = i * (TAU / 6.0)
		var bolt = Vector2(512, 340) + Vector2(cos(ang), sin(ang)) * 100.0
		draw_circle(bolt, 8.0, Color("ecf0f1"))

	# Stacks of Gold Bars
	for gx in range(300, 420, 35):
		for gy in range(500, 550, 15):
			draw_rect(Rect2(gx, gy, 30, 12), Color("f1c40f"))
			draw_rect(Rect2(gx, gy, 30, 12), Color("f39c12"), false, 1.0)
	for gx in range(600, 720, 35):
		for gy in range(500, 550, 15):
			draw_rect(Rect2(gx, gy, 30, 12), Color("f1c40f"))
			draw_rect(Rect2(gx, gy, 30, 12), Color("f39c12"), false, 1.0)

	# Bank Vault Covers / Grates
	draw_rect(Rect2(235, 190, 70, 90), Color("0f172a"))
	draw_rect(Rect2(715, 190, 70, 90), Color("0f172a"))
	draw_rect(Rect2(472, 250, 80, 100), Color("0f172a"))
	draw_rect(Rect2(195, 430, 80, 120), Color("0f172a"))
	draw_rect(Rect2(749, 430, 80, 120), Color("0f172a"))

func draw_train_background():
	# Moving Prairie Landscape
	draw_rect(Rect2(0, 0, 1024, 250), Color("e74c3c")) # Scorching Sun Sky
	draw_rect(Rect2(0, 250, 1024, 150), Color("d35400"))
	draw_circle(Vector2(800, 180), 50.0, Color("f1c40f"))

	# Moving Desert Ground
	draw_rect(Rect2(0, 400, 1024, 368), Color("8e44ad"))
	var speed_line = int(Time.get_ticks_msec() * 0.8) % 100
	for lx in range(-100, 1124, 100):
		draw_line(Vector2(lx + speed_line, 550), Vector2(lx + speed_line - 40, 768), Color("6c3483"), 4.0)

	# Railway Iron Tracks & Wooden Ties
	draw_rect(Rect2(0, 530, 1024, 16), Color("7f8c8d"))
	draw_rect(Rect2(0, 560, 1024, 16), Color("7f8c8d"))

	# Passenger Train Freight Car Interior
	draw_rect(Rect2(140, 100, 744, 440), Color("5d4037"))
	draw_rect(Rect2(120, 80, 784, 30), Color("3e2723")) # Roof

	# Wooden Plank Lines
	for py in range(120, 530, 20):
		draw_line(Vector2(140, py), Vector2(884, py), Color("3e2723"), 2.0)

	# Train Doors & Window Covers
	draw_rect(Rect2(235, 190, 70, 90), Color("1a0e07"))
	draw_rect(Rect2(715, 190, 70, 90), Color("1a0e07"))
	draw_rect(Rect2(472, 250, 80, 100), Color("1a0e07"))
	draw_rect(Rect2(195, 430, 80, 120), Color("1a0e07"))
	draw_rect(Rect2(749, 430, 80, 120), Color("1a0e07"))

	# Cargo Wooden Crates
	draw_rect(Rect2(360, 450, 70, 70), Color("8d6e63"))
	draw_rect(Rect2(360, 450, 70, 70), Color("4e342e"), false, 3.0)
	draw_line(Vector2(360, 450), Vector2(430, 520), Color("4e342e"), 2.0)

	draw_rect(Rect2(590, 440, 80, 80), Color("8d6e63"))
	draw_rect(Rect2(590, 440, 80, 80), Color("4e342e"), false, 3.0)
	draw_line(Vector2(590, 440), Vector2(670, 520), Color("4e342e"), 2.0)

func draw_hideout_background():
	# Night Sky in Red Canyon Cavern
	draw_rect(Rect2(0, 0, 1024, 768), Color("0b0914"))
	# Moon
	draw_circle(Vector2(850, 120), 40.0, Color("f4f6f7"))
	draw_circle(Vector2(835, 120), 35.0, Color("0b0914"))

	# Rocky Cave Overhead Arch
	var cave_top = PackedVector2Array([
		Vector2(0, 0), Vector2(1024, 0), Vector2(1024, 120),
		Vector2(800, 80), Vector2(512, 110), Vector2(200, 70), Vector2(0, 130)
	])
	draw_colored_polygon(cave_top, Color("1c1427"))

	# Wooden Barricade Outpost Base
	draw_rect(Rect2(160, 120, 704, 460), Color("2e1a12"))
	for px in range(180, 860, 25):
		draw_line(Vector2(px, 120), Vector2(px, 580), Color("170d09"), 3.0)

	# Glowing Campfire in Center Foreground
	var fire_glow = (sin(Time.get_ticks_msec() * 0.008) + 1.0) * 10.0
	draw_circle(Vector2(512, 510), 35.0 + fire_glow, Color(0.9, 0.4, 0.1, 0.3))
	draw_circle(Vector2(512, 510), 22.0, Color("e67e22"))
	draw_circle(Vector2(512, 510), 12.0, Color("f1c40f"))

	# Hideout Openings / Covers
	draw_rect(Rect2(235, 190, 70, 90), Color("06040a"))
	draw_rect(Rect2(715, 190, 70, 90), Color("06040a"))
	draw_rect(Rect2(472, 250, 80, 100), Color("06040a"))
	draw_rect(Rect2(195, 430, 80, 120), Color("06040a"))
	draw_rect(Rect2(749, 430, 80, 120), Color("06040a"))

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

	# Drop shadow behind target
	draw_ellipse(Vector2(cx, top + size.y * 0.95), 24.0, 8.0, Color(0, 0, 0, 0.4))

	if pop_ratio > 0.15:
		# Cowboy Hat with Brim & Red Band
		var hat_brim = PackedVector2Array([
			Vector2(cx - 36, top + 18), Vector2(cx, top + 8), Vector2(cx + 36, top + 18),
			Vector2(cx + 32, top + 24), Vector2(cx, top + 15), Vector2(cx - 32, top + 24)
		])
		draw_colored_polygon(hat_brim, Color("3e1f0c"))
		draw_rect(Rect2(cx - 18, top + 0, 36, 16), Color("4a2511"))
		draw_rect(Rect2(cx - 18, top + 12, 36, 4), Color("b03a2e"))

	if pop_ratio > 0.25:
		# Head & Threatening Eyes
		draw_rect(Rect2(cx - 15, top + 18, 30, 26), Color("f5cba7"))
		# Angry Eyebrows
		draw_line(Vector2(cx - 13, top + 22), Vector2(cx - 3, top + 25), Color("1c2833"), 3.0)
		draw_line(Vector2(cx + 3, top + 25), Vector2(cx + 13, top + 22), Color("1c2833"), 3.0)
		draw_circle(Vector2(cx - 7, top + 27), 3.0, Color("e74c3c"))
		draw_circle(Vector2(cx + 7, top + 27), 3.0, Color("e74c3c"))
		# Outlaw Mask / Red Bandana
		var bandana = PackedVector2Array([
			Vector2(cx - 16, top + 31), Vector2(cx + 16, top + 31),
			Vector2(cx + 11, top + 47), Vector2(cx, top + 52), Vector2(cx - 11, top + 47)
		])
		draw_colored_polygon(bandana, Color("c0392b"))

	if pop_ratio > 0.45:
		# Vest, Shirt, Belt & Aimed Revolver
		draw_rect(Rect2(cx - 20, top + 46, 40, 42), Color("283747"))
		draw_rect(Rect2(cx - 24, top + 46, 10, 42), Color("78281f"))
		draw_rect(Rect2(cx + 14, top + 46, 10, 42), Color("78281f"))

		# Outlaw Aiming Revolver Barrel towards Sheriff
		draw_rect(Rect2(cx + 20, top + 38, 24, 8), Color("515a5a")) # Gun barrel
		draw_rect(Rect2(cx + 18, top + 44, 8, 14), Color("3e1f0c")) # Gun grip

func draw_detailed_fast_outlaw(pos: Vector2, size: Vector2, pop_ratio: float):
	var cx = pos.x + size.x / 2.0
	var top = pos.y

	draw_ellipse(Vector2(cx, top + size.y * 0.95), 24.0, 8.0, Color(0, 0, 0, 0.4))

	if pop_ratio > 0.15:
		# Black Desperado Sombrero Hat
		draw_rect(Rect2(cx - 38, top + 14, 76, 8), Color("17202a"))
		draw_rect(Rect2(cx - 20, top + 0, 40, 16), Color("1c2833"))
		draw_rect(Rect2(cx - 20, top + 13, 40, 3), Color("f1c40f")) # Gold trim

	if pop_ratio > 0.25:
		# Face with Eye Patch & Gold Tooth
		draw_rect(Rect2(cx - 15, top + 18, 30, 26), Color("edbb99"))
		draw_line(Vector2(cx - 15, top + 20), Vector2(cx + 15, top + 26), Color("17202a"), 2.5)
		draw_rect(Rect2(cx - 11, top + 21, 10, 10), Color("17202a")) # Eye patch
		draw_circle(Vector2(cx + 7, top + 25), 3.0, Color("f1c40f")) # Glinting eye
		var mustache = PackedVector2Array([
			Vector2(cx - 14, top + 34), Vector2(cx + 14, top + 34), Vector2(cx, top + 40)
		])
		draw_colored_polygon(mustache, Color("3e1f0c"))

	if pop_ratio > 0.45:
		# Dark Blue Duster Coat & Dual Revolvers
		draw_rect(Rect2(cx - 24, top + 42, 48, 46), Color("1a5276"))
		draw_rect(Rect2(cx - 34, top + 36, 16, 8), Color("7f8c8d")) # Left revolver
		draw_rect(Rect2(cx + 18, top + 36, 16, 8), Color("7f8c8d")) # Right revolver

func draw_detailed_civilian(pos: Vector2, size: Vector2, pop_ratio: float):
	var cx = pos.x + size.x / 2.0
	var top = pos.y

	draw_ellipse(Vector2(cx, top + size.y * 0.95), 24.0, 8.0, Color(0, 0, 0, 0.4))

	if pop_ratio > 0.15:
		# Bonnet / Straw Hat
		draw_circle(Vector2(cx, top + 14), 22.0, Color("f4d03f"))

	if pop_ratio > 0.25:
		# Innocent Face with Surprised Big Eyes
		draw_rect(Rect2(cx - 14, top + 16, 28, 24), Color("f5cba7"))
		draw_circle(Vector2(cx - 7, top + 22), 4.0, Color("2980b9"))
		draw_circle(Vector2(cx + 7, top + 22), 4.0, Color("2980b9"))
		draw_circle(Vector2(cx, top + 33), 5.0, Color("78281f")) # O-shaped surprised mouth

	if pop_ratio > 0.45:
		# Civilian Green Dress & Raised Surrendering Hands
		draw_rect(Rect2(cx - 22, top + 38, 44, 46), Color("27ae60"))
		draw_rect(Rect2(cx - 10, top + 42, 20, 42), Color("ffffff")) # Apron
		# Hands Up in Panic!
		draw_rect(Rect2(cx - 28, top + 8, 8, 32), Color("f5cba7"))
		draw_rect(Rect2(cx + 20, top + 8, 8, 32), Color("f5cba7"))

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

func get_gun_barrel_tip() -> Vector2:
	var base_x = 512.0 + (crosshair_pos.x - 512.0) * 0.35
	var base_y = 750.0 + recoil_offset * 0.5
	var gun_base = Vector2(base_x, base_y)
	var dir = crosshair_pos - gun_base
	var angle = clamp(dir.angle() + PI / 2.0, -deg_to_rad(40.0), deg_to_rad(40.0))
	return gun_base + Vector2(0, -180).rotated(angle)

func draw_gun_overlay():
	# High-Detail Realistic Metallic Revolver Overlay tracking crosshair target position
	var base_x = 512.0 + (crosshair_pos.x - 512.0) * 0.35
	var base_y = 750.0 + recoil_offset * 0.5
	var gun_base = Vector2(base_x, base_y)

	var dir = crosshair_pos - gun_base
	var target_angle = dir.angle() + PI / 2.0
	target_angle = clamp(target_angle, -deg_to_rad(40.0), deg_to_rad(40.0))
	var recoil_tilt = -deg_to_rad(recoil_offset * 0.8)

	draw_set_transform(gun_base, target_angle + recoil_tilt, Vector2(1.1, 1.1))

	# Revolver Shadow / Outline
	draw_rect(Rect2(-22, -185, 44, 150), Color(0.05, 0.05, 0.05, 0.4))

	# Metallic Steel Barrel with Highlights & Bevels
	draw_rect(Rect2(-18, -180, 36, 140), Color("2c3e50")) # Main Dark Steel
	draw_rect(Rect2(-12, -180, 8, 140), Color("7f8c8d")) # Light Reflection
	draw_rect(Rect2(-4, -180, 4, 140), Color("ecf0f1")) # Specular Strip

	# Front Sight & Red Fiber Optic Tip
	draw_rect(Rect2(-5, -192, 10, 14), Color("1a252f"))
	draw_rect(Rect2(-3, -190, 6, 8), Color("e74c3c"))

	# Cylinder Frame & Ejector Rod
	draw_rect(Rect2(-20, -50, 40, 10), Color("34495e"))
	draw_rect(Rect2(-34, -40, 68, 55), Color("1a252f"))
	draw_rect(Rect2(-30, -36, 60, 47), Color("2c3e50"))
	draw_rect(Rect2(-30, -36, 60, 47), Color("7f8c8d"), false, 2.5)

	# Fluted Cylinder Chambers
	for i in range(5):
		var cx = -22 + i * 11
		draw_rect(Rect2(cx - 3, -32, 6, 39), Color("111827"))
		draw_circle(Vector2(cx, -12), 4.0, Color("f1c40f")) # Brass Shell Base

	# Revolver Hammer & Frame Recipient
	draw_rect(Rect2(-8, 15, 16, 25), Color("2c3e50"))
	draw_colored_polygon(PackedVector2Array([
		Vector2(-6, 15), Vector2(6, 15), Vector2(10, 35), Vector2(-10, 35)
	]), Color("1a252f"))

	# Polished Mahogany Wood Grip
	var grip_pts = PackedVector2Array([
		Vector2(-24, 25), Vector2(24, 25),
		Vector2(32, 95), Vector2(-32, 95)
	])
	draw_colored_polygon(grip_pts, Color("6e3c1b"))
	draw_polyline(grip_pts, Color("3d1e0b"), 3.0)
	# Brass Star Medallion on Grip
	draw_circle(Vector2(0, 58), 7.0, Color("f1c40f"))
	draw_circle(Vector2(0, 58), 5.0, Color("d35400"))

	# Reset Canvas Transform
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1, 1))

func draw_muzzle_flash():
	var tip = get_gun_barrel_tip()
	# Screen Muzzle Flash Burst
	draw_circle(tip, 45.0, Color("f1c40f"))
	draw_circle(tip, 25.0, Color("ffffff"))
	# Starburst Rays
	for i in range(8):
		var ang = i * (TAU / 8.0)
		var p1 = tip + Vector2(cos(ang), sin(ang)) * 20.0
		var p2 = tip + Vector2(cos(ang), sin(ang)) * 65.0
		draw_line(p1, p2, Color("f39c12"), 4.0)

func draw_crosshair():
	draw_arc(crosshair_pos, 12.0, 0, TAU, 16, Color("e74c3c"), 2.0)
	draw_line(crosshair_pos - Vector2(16, 0), crosshair_pos - Vector2(8, 0), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos + Vector2(8, 0), crosshair_pos + Vector2(16, 0), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos - Vector2(0, 16), crosshair_pos - Vector2(0, 8), Color("e74c3c"), 2.0)
	draw_line(crosshair_pos + Vector2(0, 8), crosshair_pos + Vector2(0, 16), Color("e74c3c"), 2.0)
	draw_rect(Rect2(crosshair_pos - Vector2(1, 1), Vector2(2, 2)), Color("f1c40f"))

func draw_heart_icon(pos: Vector2, scale_factor: float = 1.0):
	var red = Color("e74c3c")
	draw_circle(pos + Vector2(-5 * scale_factor, -3 * scale_factor), 6.0 * scale_factor, red)
	draw_circle(pos + Vector2(5 * scale_factor, -3 * scale_factor), 6.0 * scale_factor, red)
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

	draw_string(font, Vector2(710, 34), "HP:", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("e74c3c"))
	for i in range(lives):
		draw_heart_icon(Vector2(765 + i * 26, 28), 1.0)

	var time_col = Color("e74c3c") if wave_time_left <= 5.0 else Color("2ecc71")
	draw_string(font, Vector2(880, 34), "TIME: " + str(int(ceil(wave_time_left))) + "s", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, time_col)

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
