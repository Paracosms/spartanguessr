import time
from flask import Flask, request

app = Flask(__name__)

@app.route('/api/time', methods=['GET', 'POST'])
def get_current_time():
    if request.method == 'POST':
        data = request.get_json()
        print("Received:", data)
    return {'time': time.time()}

if __name__ == '__main__':
    app.run(debug=True)