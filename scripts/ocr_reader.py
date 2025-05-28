import sys
import os
from azure.cognitiveservices.vision.computervision import ComputerVisionClient
from msrest.authentication import CognitiveServicesCredentials
from dotenv import load_dotenv
import time
from google import genai

gemini_client = genai.Client(api_key="GEMINI_API_KEY")

key = 'AZURE_KEY'
endpoint = 'AZURE_ENDPOINT'

def main(image_path):
    if not key or not endpoint:
        print("HATA: Azure API anahtarı veya endpoint eksik!")
        return

    try:
        ocr_client = ComputerVisionClient(endpoint, CognitiveServicesCredentials(key))
        with open(image_path, "rb") as image_stream:
            response = ocr_client.read_in_stream(image_stream, raw=True)
        operation_location = response.headers["Operation-Location"]
        operation_id = operation_location.split("/")[-1]

        while True:
            result = ocr_client.get_read_result(operation_id)
            if result.status not in ['notStarted', 'running']:
                break
            time.sleep(1)

        if result.status == "succeeded":
            for page in result.analyze_result.read_results:
                for line in page.lines:
                    response = gemini_client.models.generate_content(
                        model="gemini-1.5-flash-8b", contents=f"Just edit this code for code language as a text: {line.text}. Don't add any other text. Just return the code as a text.",
                    )
                    result = response.text
                    result = result.replace("```", "")
                    result = result.replace("python", "")

                    print(result)
        else:
            print("Azure OCR başarısız oldu.")

    except Exception as e:
        print("OCR sırasında hata:", e)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python ocr_azure.py <image_path>")
    else:
        main(sys.argv[1])
