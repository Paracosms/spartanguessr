"""
SpartanGuessr Score Algorithm

- Score formula from geogeussr: 5000 * e^(-10 * (Distance / Max Distance))
    - From "Beginner's Guide to Geoguessr", might be helpful later: https://www.plonkit.net/beginners-guide#game-mechanics
        - "'Distance' naturally refers to the distance between the guess and the correct location. 
           'Max Distance' is the diagonal of the smallest rectangle possible that would contain every location in the map."
    - Added exponent to distance/max_distance to make it less harsh at shorter distances, accounts for smaller campus size compared to world map
"""

import math

def score_algorithm(guess_point, correct_point):
    MAX_DISTANCE = 2073 # diagonal of smallest rectangle possible that contains every location on map, ie. rectangle that surrounds sjsu campus

    distance = math.dist(guess_point, correct_point) # distance between guess and correct location

    # calculate score
    score = 5000 * pow(math.e, (-10 * pow(distance / MAX_DISTANCE, 1.4))) # change exponent on distance/max_dist to adjust difficulty
    if (score > 4970): # also have to adjust perfect score pass based on exponent above
        score = 5000
    return round(score), distance

# print(score_algorithm([0,0], [0,0]))
# ^ just for debugging
