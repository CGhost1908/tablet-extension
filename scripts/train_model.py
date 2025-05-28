import os
import pytesseract
from PIL import Image
import cv2
import numpy as np
import shutil
import sys

def train_custom_model(data_path):
    # 1. Veri setini hazırla
    training_data = []
    chars = os.listdir(data_path)
    
    for char in chars:
        char_path = os.path.join(data_path, char)
        if os.path.isdir(char_path):
            for img_file in os.listdir(char_path):
                if img_file.endswith('.png'):
                    img_path = os.path.join(char_path, img_file)
                    training_data.append((char, img_path))
    
    # 2. Özel .box dosyaları oluştur
    with open('custom.training_text', 'w') as f:
        for char, img_path in training_data:
            f.write(f"{char}\n")
    
    # 3. Modeli eğit (basitleştirilmiş versiyon)
    try:
        pytesseract.run_tesseract(
            'custom.training_text',
            'custom',
            lang=None,
            boxes=True,
            config="--psm 6"
        )
        
        # 4. Eğitilmiş modeli kaydet
        os.rename('custom.traineddata', 'tur_custom.traineddata')
        return True
    except Exception as e:
        print(f"Eğitim hatası: {str(e)}")
        return False

if __name__ == "__main__":
    extension_path = sys.argv[1]
    data_path = os.path.join(extension_path, 'calibration-data')
    
    if train_custom_model(data_path):
        print("Model başarıyla eğitildi!")
        # Modeli Tesseract klasörüne kopyala
        tessdata_dir = pytesseract.get_tesseract_config()[0]
        shutil.copy('tur_custom.traineddata', os.path.join(tessdata_dir, 'tessdata'))
    else:
        print("Model eğitilemedi!")