ROUND_DIFFICULTY_ORDER = {
    "easy": {
        3: ["easy", "easy", "medium"],
        5: ["easy", "easy", "easy", "medium", "medium"],
        10: ["easy", "easy", "easy", "easy", "easy", "medium", "medium", "medium", "medium", "medium"],
    },
    "medium": {
        3: ["easy", "medium", "hard"],
        5: ["easy", "medium", "medium", "medium", "hard"],
        10: ["easy", "easy", "medium", "medium", "medium", "medium", "medium", "hard", "hard", "hard"],
    },
    "hard": {
        3: ["medium", "medium", "hard"],
        5: ["easy", "medium", "medium", "hard", "hard"],
        10: ["easy", "medium", "medium", "medium", "medium", "hard", "hard", "hard", "hard", "hard"],
    },
}


def get_round_difficulty(session_difficulty, max_rounds, round_number):
    schedule = ROUND_DIFFICULTY_ORDER.get(session_difficulty, {}).get(max_rounds)
    if not schedule:
        return session_difficulty

    round_index = max(1, min(round_number, len(schedule))) - 1
    return schedule[round_index]
