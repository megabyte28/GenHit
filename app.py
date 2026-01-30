from flask import Flask, render_template, request, jsonify
from ultralytics import YOLO
import psycopg2
import os
from werkzeug.utils import secure_filename
import shutil
from groq import Groq
import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Create uploads folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# 1. Initialize YOLO
model = YOLO('best2.pt')

# 2. Database connection helper
def get_db_connection():
    return psycopg2.connect(
        database="postgres",
        user="postgres.bwdlkqjgrrefoayancsm",
        password="qamxe7rokWacnohmoh",
        host="aws-1-ap-south-1.pooler.supabase.com",
        port="5432",
        sslmode="require"
    )

# 3. Route to serve the Map
@app.route('/')
def index():
    return render_template('index.html')

# 4. Route to handle image upload
@app.route('/upload-image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({"status": "error", "message": "No image provided"}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No file selected"}), 400
    
    # Check file extension
    if not allowed_file(file.filename):
        return jsonify({"status": "error", "message": "Only jpg, jpeg, png allowed"}), 400
    
    # Clear old uploads and save new image
    for f in os.listdir(app.config['UPLOAD_FOLDER']):
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], f))
    
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    return jsonify({
        "status": "success",
        "message": "Image uploaded successfully",
        "filename": filename
    })

# 5. Helper function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_ai_description(problem, ward, count):
    
            system_prompt = f"""
            You are a Technical Civic Auditor. Write a 3-line formal English audit summary.
            - If count < 5: 'Routine Maintenance'
            - If count 5-10: 'Elevated Priority'
            - If 10+: 'Critical High Priority'
            Focus on {ward} Ward.
            """
            

            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Issue: {problem}, Ward: {ward}, Total: {count}"}
                ]
            )
            return completion.choices[0].message.content


def generate_mcd_petition(issue, ward, count, image_link):
    system_prompt = f"""
    You are a Legal Advocate and Technical Auditor for 'The AI Civic Auditor'.
    Your goal is to draft a formal, authoritative petition to the Deputy Commissioner of the {ward} Zone, MCD.
    The email must follow this structure:
    1. Subject: [URGENT CIVIC AUDIT] Persistent {issue} detected in {ward} Ward.
    2. Reference: YOLO AI Verification ID #HACKJNU-2026.
    3. Body: Clearly state that our AI has detected {issue} and {count} local citizens have validated this report.
    4. Call to Action: Demand a site inspection and resolution within 48 hours as per municipal standards.
    5. Proof: Mention that the photographic evidence is attached via this link: {image_link}.
    Tone: Firm, respectful, and legally sound.
    """

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate the email for {issue} in {ward} Ward with {count} reports."}
        ]
    )
    return completion.choices[0].message.content

def email_send(body):
    """Email bhejane wala 'Postman' logic"""
    sender = os.getenv("SENDER_EMAIL")
    password = os.getenv("SENDER_PASSWORD")
    recipient="mridulbhatia2008@gmail.com"
    msg=MIMEMultipart()
    msg['From'] = sender
    msg['To'] = recipient
    msg['Subject'] = "subject"
    msg.attach(MIMEText(body, 'plain')) 

    try:
        # Gmail Server connection
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls() 
        server.login(sender, password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"❌ Mail Error: {e}")
        return False

# 6. Route to handle the Click + AI Scan + Save
@app.route('/report-issue', methods=['POST'])
def report_issue():
    try:
        data = request.json
        lat, lng = data['lat'], data['lng']
        
        # Run YOLO on the uploaded image
        detected_problems = []
        upload_folder = app.config['UPLOAD_FOLDER']
        
        if os.listdir(upload_folder):
            for filename in os.listdir(upload_folder):
                if filename.endswith((".jpg", ".png", ".jpeg")):
                    results = model(os.path.join(upload_folder, filename))
                    for r in results:
                        # Add detected labels to our list
                        labels = [model.names[int(c)] for c in r.boxes.cls]
                        detected_problems.extend(labels)
        else:
            return jsonify({
                "status": "error",
                "message": "No image uploaded. Please upload an image first."
            }), 400
        
        # Remove duplicates from the array
        unique_problems = list(set(detected_problems))
        

        ai_desp=get_ai_description(unique_problems,"southzone",1)
        print(ai_desp)

        complaint_email=generate_mcd_petition(unique_problems,"southzone",1,filename)
        print(complaint_email)

        email_send(complaint_email)
        
        # Save to Supabase
        conn = get_db_connection()
        cur = conn.cursor()
        query = "INSERT INTO complaints (issue_type, location,ai_description,report_count) VALUES (%s, ST_SetSRID(ST_MakePoint(%s,%s), 4326),%s,%s) RETURNING complaint_id"
        cur.execute(query, (unique_problems, float(lng), float(lat),ai_desp,1))
        report_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "status": "success",
            "detected": unique_problems,
            "location": f"{lat}, {lng}",
            "report_id": report_id,
            "ai_description": ai_desp
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    



# New route: return all stored reports as JSON
@app.route('/reports', methods=['GET'])
def get_reports():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = "SELECT complaint_id, issue_type, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat, ai_description, report_count FROM complaints"
        cur.execute(query)
        rows = cur.fetchall()
        reports = []
        for r in rows:
            complaint_id, issue_type, lng, lat, ai_description, report_count = r
            # Ensure issue_type is a list for JSON serialization
            try:
                issues = list(issue_type)
            except Exception:
                issues = [issue_type]
            reports.append({
                "id": complaint_id,
                "issues": issues,
                "lng": float(lng),
                "lat": float(lat),
                "ai_description": ai_description,
                "report_count": report_count
            })
        cur.close()
        conn.close()
        return jsonify({"status": "success", "reports": reports})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)