extends Node2D

enum GameState { START_SCREEN, PLAYING, WAVE_CLEAR, GAME_OVER }

var current_state = GameState.START_SCREEN

# Game Configuration Settings
var clip_size = 6
var max_lives = 3
var starting_lives = 3

var score = 0
var high_score = 0
var lives = 3
var ammo = 6
var is_reloading = false

var current_wave_index = 0
var wave_time_left = 30.0
var spawn_timer = 0.0

var crosshair_pos = Vector2(512, 384)
var active_targets = []
var bullet_holes = []

var recoil_offset = 0.0
var muzzle_flash_timer = 0.0

var covers = [
	{ "id": "window_top_left", "x": 240, "y": 200, "w": 60, "h": 80 },
	{ "id": "window_top_right", "x": 724, "y": 200, "w": 60, "h": 80 },
	{ "id": "door_bottom_left", "x": 200, "y": 440, "w": 70, "h": 110 },
	{ "id": "door_bottom_right", "x": 754, "y": 440, "w": 70, "h": 110 },
	{ "id": "balcony_center", "x": 480, "y": 260, "w": 64, "h": 90 }
]

var waves = [
	{
		"name": "Wave 1: Dusty Outskirts",
		"duration_sec": 30,
		"spawn_interval_ms": 1500,
		"target_visible_duration_ms": 2200,
		"points_outlaw": 100,
		"points_civilian_penalty": 200,
		"outlaw_ratio": 0.8
	},
	{
		"name": "Wave 2: High Noon Showdown",
		"duration_sec": 30,
		"spawn_interval_ms": 1100,
		"target_visible_duration_ms": 1600,
		"points_outlaw": 150,
		"points_civilian_penalty": 250,
		"outlaw_ratio": 0.7
	},
	{
		"name": "Wave 3: Outlaw Rampage",
		"duration_sec": 35,
		"spawn_interval_ms": 800,
		"target_visible_duration_ms": 1200,
		"points_outlaw": 200,
		"points_civilian_penalty": 300,
		"outlaw_ratio": 0.65
	}
]

var audio_players = {}

func _ready():
	load_toml_config()
	setup_audio()
	queue_redraw()

func setup_audio():
	var sfx_names = ["shoot", "dry_fire", "reload", "hit_outlaw", "hit_civilian", "hurt"]
	for sfx in sfx_names:
		var p = AudioStreamPlayer.new()
		add_child(p)
		audio_players[sfx] = p

func play_sfx(sfx_name):
	if audio_players.has(sfx_name):
		var p = audio_players[sfx_name]
		if p.stream:
			p.play()

func load_toml_config():
	var file_path = "res://config/scenes.toml"
	if not FileAccess.file_exists(file_path):
		file_path = "res://scenes.cfg"
		if not FileAccess.file_exists(file_path):
			ammo = clip_size
			lives = starting_lives
			return

	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		ammo = clip_size
		lives = starting_lives
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
			var val_str = parts[1].strip_edges()
			var val = parse_toml_val(val_str)

			if current_section == "game":
				if key == "clip_size": clip_size = int(val)
				elif key == "starting_lives": starting_lives = int(val)
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
				"w": int(c.get("width", 50)),
				"h": int(c.get("height", 80))
			})

	if temp_waves.size() > 0:
		waves.clear()
		for w in temp_waves:
			waves.append({
				"name": str(w.get("name", "Wave")),
				"duration_sec": int(w.get("duration_sec", 30)),
				"spawn_interval_ms": int(w.get("spawn_interval_ms", 1500)),
				"target_visible_duration_ms": int(w.get("target_visible_duration_ms", 2000)),
				"points_outlaw": int(w.get("points_outlaw", 100)),
				"points_civilian_penalty": int(w.get("points_civilian_penalty", 200)),
				"outlaw_ratio": float(w.get("outlaw_ratio", 0.75))
			})

func parse_toml_val(val_str: String):
	if val_str.begins_with("\"") and val_str.ends_with("\""):
		return val_str.substr(1, val_str.length() - 2)
	elif val_str.is_valid_float():
		return val_str.to_float()
	elif val_str.is_valid_int():
		return val_str.to_int()
	return val_str

func start_new_game():
	score = 0
	lives = starting_lives
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
	if current_state != GameState.PLAYING:
		if current_state == GameState.START_SCREEN or current_state == GameState.GAME_OVER:
			start_new_game()
		elif current_state == GameState.WAVE_CLEAR:
			if current_wave_index + 1 < waves.size():
				start_wave(current_wave_index + 1)
			else:
				start_new_game()
		return

	if pos.x >= 1024 - 160 and pos.y >= 768 - 60:
		reload()
		return

	shoot(pos)

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
				var bonus = 50 if t["type"] == "fast_outlaw" else 0
				score += int(curr_wave["points_outlaw"]) + bonus
				if score > high_score:
					high_score = score
				play_sfx("hit_outlaw")
			else:
				score = max(0, score - int(curr_wave["points_civilian_penalty"]))
				play_sfx("hit_civilian")
			break

	if hit_index != -1:
		active_targets.remove_at(hit_index)

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
		queue_redraw()

	if muzzle_flash_timer > 0.0:
		muzzle_flash_timer = max(0.0, muzzle_flash_timer - delta)
		queue_redraw()

	var now_msec = Time.get_ticks_msec()
	for i in range(bullet_holes.size() - 1, -1, -1):
		if now_msec - bullet_holes[i]["time"] > 5000:
			bullet_holes.remove_at(i)

	if current_state != GameState.PLAYING:
		return

	var curr_wave = waves[current_wave_index]

	wave_time_left -= delta
	if wave_time_left <= 0.0:
		current_state = GameState.WAVE_CLEAR
		queue_redraw()
		return

	spawn_timer += delta * 1000.0
	if spawn_timer >= curr_wave["spawn_interval_ms"]:
		spawn_timer = 0.0
		spawn_target()

	for i in range(active_targets.size() - 1, -1, -1):
		var t = active_targets[i]
		t["timer"] -= delta * 1000.0
		t["anim_timer"] = min(150.0, t["anim_timer"] + delta * 1000.0)

		if t["timer"] <= 0.0:
			if t["type"] == "outlaw" or t["type"] == "fast_outlaw":
				lives -= 1
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
	var is_outlaw = randf() < float(curr_wave["outlaw_ratio"])
	var t_type = "civilian"
	if is_outlaw:
		t_type = "fast_outlaw" if randf() < 0.3 else "outlaw"

	active_targets.append({
		"cover_id": sel["id"],
		"x": sel["x"],
		"y": sel["y"],
		"w": sel["w"],
		"h": sel["h"],
		"type": t_type,
		"timer": float(curr_wave["target_visible_duration_ms"]),
		"anim_timer": 0.0
	})

func _draw():
	draw_background()
	draw_targets()
	draw_bullet_holes()
	draw_gun_overlay()
	if muzzle_flash_timer > 0.0:
		draw_muzzle_flash()
	draw_crosshair()
	draw_hud()

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

	draw_rect(Rect2(240, 200, 60, 80), Color("170b04"))
	draw_rect(Rect2(724, 200, 60, 80), Color("170b04"))
	draw_rect(Rect2(200, 440, 70, 110), Color("170b04"))
	draw_rect(Rect2(754, 440, 70, 110), Color("170b04"))

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

		var col = Color("b03a2e") if t["type"] == "outlaw" else (Color("1a5276") if t["type"] == "fast_outlaw" else Color("27ae60"))
		draw_rect(Rect2(t["x"], render_y, t["w"], visible_h), col)

		if pop_ratio > 0.3:
			draw_rect(Rect2(t["x"] + 15, render_y + 5, 30, 20), Color("f5cba7"))
			if t["type"] == "civilian":
				draw_rect(Rect2(t["x"] + 10, render_y - 5, 40, 10), Color("f4d03f"))

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

func draw_hud():
	draw_rect(Rect2(0, 0, 1024, 54), Color(0.1, 0.05, 0.01, 0.85))
	draw_rect(Rect2(0, 0, 1024, 54), Color("c85a17"), false, 3.0)

	var font = ThemeDB.fallback_font
	draw_string(font, Vector2(15, 34), "SCORE: " + str(score), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("f1c40f"))
	draw_string(font, Vector2(160, 34), "HIGH: " + str(high_score), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("f1c40f"))

	var curr_wave = waves[current_wave_index] if current_wave_index < waves.size() else waves[0]
	draw_string(font, Vector2(512 - 100, 34), curr_wave["name"], HORIZONTAL_ALIGNMENT_CENTER, -1, 18, Color("ffffff"))

	var hp_str = "HP: "
	for i in range(lives):
		hp_str += "<3 "
	draw_string(font, Vector2(740, 34), hp_str, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("e74c3c"))

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
	draw_rect(Rect2(0, 0, 1024, 768), Color(0.05, 0.02, 0.01, 0.88))

	if current_state == GameState.START_SCREEN:
		draw_string(font, Vector2(512 - 280, 280), "WILD WEST LIGHT GUN ARCADE", HORIZONTAL_ALIGNMENT_CENTER, -1, 32, Color("f1c40f"))
		draw_string(font, Vector2(512 - 250, 360), "AIM & SHOOT OUTLAWS | SPARE CIVILIANS", HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(512 - 230, 400), "SPACE OR ON-SCREEN BUTTON TO RELOAD", HORIZONTAL_ALIGNMENT_CENTER, -1, 20, Color("ffffff"))
		draw_string(font, Vector2(512 - 180, 500), "CLICK / TAP TO START GAME", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("e74c3c"))
	elif current_state == GameState.WAVE_CLEAR:
		draw_string(font, Vector2(512 - 150, 300), "WAVE CLEARED!", HORIZONTAL_ALIGNMENT_CENTER, -1, 38, Color("2ecc71"))
		draw_string(font, Vector2(512 - 140, 380), "CURRENT SCORE: " + str(score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("f1c40f"))
		draw_string(font, Vector2(512 - 180, 480), "CLICK / TAP FOR NEXT WAVE", HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color("ffffff"))
	elif current_state == GameState.GAME_OVER:
		draw_string(font, Vector2(512 - 140, 280), "GAME OVER", HORIZONTAL_ALIGNMENT_CENTER, -1, 44, Color("e74c3c"))
		draw_string(font, Vector2(512 - 120, 360), "FINAL SCORE: " + str(score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("ffffff"))
		draw_string(font, Vector2(512 - 110, 400), "HIGH SCORE: " + str(high_score), HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("ffffff"))
		draw_string(font, Vector2(512 - 150, 500), "CLICK / TAP TO RESTART", HORIZONTAL_ALIGNMENT_CENTER, -1, 24, Color("f1c40f"))
