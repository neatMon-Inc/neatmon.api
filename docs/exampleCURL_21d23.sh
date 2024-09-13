curl --location 'localhost:1330/api/device/437870dc-0984-492f-91c4-42c007621d23' \
--header 'Content-Type: application/json' \
--data '{
  "id": "21d23",
  "hw": 204,
  "fw": 113,
  "v": {
    "tprh0": [
      {
        "t": 74,
        "h": 18,
        "ts": 2191248
      },
      {
        "t": 10,
        "h": 38,
        "ts": 2259341
      }
    ],
    "tprh1": [
      {
        "t": 75,
        "h": 23,
        "ts": 2191248
      },
      {
        "t": 28,
        "h": 83,
        "ts": 2259342
      }
    ],
    "tprh2": [
      {
        "t": 45,
        "h": 25,
        "ts": 2191255
      },
      {
        "t": 53,
        "h": 95,
        "ts": 2259348
      }
    ]
  }
}'