def roundTracking(current_round, max_rounds, round_finished):
    #increment currentRound and start new round if a round is finished
    if round_finished and current_round < max_rounds:
        return current_round + 1, False # new round
    #player finished game session
    elif current_round == max_rounds:
        return current_round, True #result screen
    return current_round, round_finished # no change
        