"""
SpartanGuessr Score Algorithm

Requires:
    - Distance calculator: use distance formula
        - Requires scaled map with coordinate system: not implemented yet
    - Score formula from geogeussr: 5000 * e^(-10 * (Distance / Max Distance))
        - From "Beginner's Guide to Geoguessr", might be helpful later: https://www.plonkit.net/beginners-guide#game-mechanics
            - "'Distance' naturally refers to the distance between the guess and the correct location. 
               'Max Distance' is the diagonal of the smallest rectangle possible that would contain every location in the map."

Still need to do:
    - Input from frontend for guess_point and correct_point
    - Calculate max distance for sjsu campus
        - Will need coordinate system ready
"""

import math

def score_algorithm(guess_point, correct_point):
    MAX_DISTANCE = 1000 # diagonal of smallest rectangle possible that contains every location on map, ie. rectangle that surrounds sjsu campus

    distance = math.dist(guess_point, correct_point) # distance between guess and correct location
        # previous distance formula in case math function doesnt work, need individual coordinates:
        # distance = math.sqrt(pow((correct_x - guess_x), 2) + pow((correct_y - guess_y), 2))

    # calculate score
    score = 5000 * pow(math.e, (-10 * (distance / MAX_DISTANCE)))
    return round(score), distance

# print(score_algorithm([0,0], [0,0]))
# ^ just for debugging
