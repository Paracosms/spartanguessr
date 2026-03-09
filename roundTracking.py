MAX_ROUND = 5 #palce holder user input
currentRound = 0
roundFinished = false
def roundTracking():
    #increment currentRound and start new round if a round is finished
    if roundFinished and currentRound < MAX_ROUND:
        currentRound +=1
        roundFinished = false
    #player finished game session
    elif currentRound == MAX_ROUND:
        return #result screen
        