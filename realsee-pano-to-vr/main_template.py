import os
import sys
import json
import time
import zipfile
import subprocess
import requests
from dotenv import load_dotenv

load_dotenv()

APP_KEY = os.getenv("APP_KEY")
APP_SECRET = os.getenv("APP_SECRET")
BASE_URL = os.getenv("BASE_URL", "https://app-gateway.realsee.ai")
PANO_DIR = os.getenv("PANO_DIR", "./pano")
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "./workspace")

if not APP_KEY or not APP_SECRET:
    print("Error: APP_KEY and APP_SECRET are required in .env file.")
    sys.exit(1)

def main():
    base_workspace = WORKSPACE_DIR
    os.makedirs(base_workspace, exist_ok=True)
    
    # Check if a task code is provided via command line args
    task_code = sys.argv[1] if len(sys.argv) > 1 else None
    
    # If a specific task code is provided, use its dedicated workspace
    if task_code:
        workspace = os.path.join(base_workspace, task_code)
        task_code_path = os.path.join(workspace, "task_code.txt")
    else:
        # Otherwise, try to find an existing workspace that has an unfinished task
        unfinished_workspace = None
        for item in os.listdir(base_workspace):
            item_path = os.path.join(base_workspace, item)
            if os.path.isdir(item_path):
                potential_task_file = os.path.join(item_path, "task_code.txt")
                if os.path.exists(potential_task_file):
                    with open(potential_task_file, "r") as f:
                        saved_code = f.read().strip()
                        if saved_code == item:  # Ensure the directory name matches the task code
                            unfinished_workspace = item_path
                            task_code = saved_code
                            task_code_path = potential_task_file
                            print(f"Found unfinished task_code: {task_code} in {unfinished_workspace}. Resuming polling...")
                            break
        
        # If no unfinished task is found, we need to create a new workspace, but we don't have the task_code yet.
        # We will create a temporary timestamped workspace, and rename it later when we get the task_code.
        if not task_code:
            timestamp = str(int(time.time()))
            workspace = os.path.join(base_workspace, f"temp_{timestamp}")
            os.makedirs(workspace, exist_ok=True)
            task_code_path = os.path.join(workspace, "task_code.txt")
        else:
            workspace = unfinished_workspace

    proxies = {
        "http": "",
        "https": ""
    }

    if not task_code:
        print("=== Step A: Prepare Workspace ===")
        images_dir = os.path.join(workspace, "images")
        os.makedirs(images_dir, exist_ok=True)

        pano_dir = PANO_DIR
        if not os.path.exists(pano_dir):
            print(f"Error: {pano_dir} does not exist. Please place images there.")
            sys.exit(1)

        scan_list = []
        timestamp = str(int(time.time()))
        project_name = f"pano-to-3d-demo-{timestamp}"

        # Convert/copy images
        idx = 0
        for file in sorted(os.listdir(pano_dir)):
            if file.lower().endswith((".png", ".jpg", ".jpeg")):
                input_path = os.path.join(pano_dir, file)
                img_id = f"IMG_{time.strftime('%Y%m%d')}_{idx:03d}"
                output_filename = f"{img_id}.jpg"
                output_path = os.path.join(images_dir, output_filename)
                
                if file.lower().endswith(".png"):
                    print(f"Converting {file} to jpeg...")
                    subprocess.run(["sips", "-s", "format", "jpeg", input_path, "--out", output_path], check=True)
                else:
                    import shutil
                    shutil.copy(input_path, output_path)

                scan_list.append({"id": img_id, "floor": 0})
                idx += 1

        if not scan_list:
            print("No images found in pano directory.")
            sys.exit(1)

        manifest = {
            "version": "1.0",
            "project_name": project_name,
            "scan_list": scan_list,
            "floor_map": {
                "0": 0
            }
        }

        manifest_path = os.path.join(workspace, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        zip_filename = f"{project_name}.zip"
        zip_filepath = os.path.join(workspace, zip_filename)
        
        print(f"Creating zip archive {zip_filename}...")
        with zipfile.ZipFile(zip_filepath, 'w') as zipf:
            zipf.write(manifest_path, "manifest.json")
            for root, dirs, files in os.walk(images_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, workspace)
                    zipf.write(abs_path, rel_path)

        print("=== Step B & C: Get ACCESS_TOKEN ===")
        auth_resp = requests.post(f"{BASE_URL}/auth/access_token", data={
            "app_key": APP_KEY,
            "app_secret": APP_SECRET
        }, proxies=proxies).json()

        if auth_resp.get("status") != "success":
            print("Auth failed:", auth_resp)
            sys.exit(1)
            
        access_token = auth_resp["data"]["access_token"]

        print("=== Step D: Get UPLOAD_TOKEN ===")
        token_resp = requests.get(
            f"{BASE_URL}/open/v1/pano/file/token",
            headers={"Authorization": access_token},
            proxies=proxies
        ).json()

        if token_resp.get("status") != "success":
            print("Failed to get upload token:", token_resp)
            sys.exit(1)
            
        upload_token_data = token_resp["data"]
        upload_token_path = os.path.join(workspace, "upload_token.json")
        with open(upload_token_path, "w") as f:
            json.dump(upload_token_data, f)

        print("=== Step E: Upload ZIP ===")
        provider = "aws" if "realsee.ai" in BASE_URL else "cos"
        subprocess.run([
            "npx", "@realsee/universal-uploader", "upload", 
            "-p", provider, 
            "-t", upload_token_path, 
            "-k", zip_filename, 
            "--file", zip_filepath, 
            "--json"
        ], check=True)

        print("=== Step F: Submit VR Task ===")
        prefix = upload_token_data["prefix"]
        private_cos_key = f"{prefix}/{zip_filename}"
        
        task_resp = requests.post(
            f"{BASE_URL}/open/v1/pano/task/submit",
            headers={"Authorization": access_token},
            json={
                "project_name": project_name,
                "private_cos_key": private_cos_key
            },
            proxies=proxies
        ).json()

        if task_resp.get("status") != "success":
            print("Failed to submit task:", task_resp)
            sys.exit(1)
            
        task_code = task_resp["data"]["task_code"]
        print(f"Task submitted! Task Code: {task_code}")
        
        # Save task code for future queries
        task_workspace = os.path.join(base_workspace, task_code)
        os.rename(workspace, task_workspace)
        workspace = task_workspace
        task_code_path = os.path.join(workspace, "task_code.txt")
        
        with open(task_code_path, "w") as f:
            f.write(task_code)
        print(f"Task code saved to {task_code_path} for potential resume.")

    else:
        print("=== Step B & C: Get ACCESS_TOKEN (Resume) ===")
        auth_resp = requests.post(f"{BASE_URL}/auth/access_token", data={
            "app_key": APP_KEY,
            "app_secret": APP_SECRET
        }, proxies=proxies).json()

        if auth_resp.get("status") != "success":
            print("Auth failed:", auth_resp)
            sys.exit(1)
            
        access_token = auth_resp["data"]["access_token"]


    print("=== Step G: Polling Task Status ===")
    while True:
        status_resp = requests.get(
            f"{BASE_URL}/open/v1/pano/task/status?task_code={task_code}",
            headers={"Authorization": access_token},
            proxies=proxies
        ).json()
        
        if status_resp.get("status") != "success":
            print("Failed to get task status:", status_resp)
            if "expired" in status_resp.get("status", "").lower() or status_resp.get("code") == -3:
                print("Access token expired. Re-authenticating...")
                auth_resp = requests.post(f"{BASE_URL}/auth/access_token", data={
                    "app_key": APP_KEY,
                    "app_secret": APP_SECRET
                }, proxies=proxies).json()
                if auth_resp.get("status") == "success":
                    access_token = auth_resp["data"]["access_token"]
                    continue
            break
            
        data = status_resp["data"]
        status = data.get("status", "").lower()
        print(f"Current status: {status}")
        
        if status in ["success", "complete", "done"]:
            print("\n" + "="*50)
            print("🎉 VR Space generated successfully!")
            print(f"Project ID: {data.get('project_id')}")
            print(f"VR URL: {data.get('vr_url') or data.get('view_url') or data.get('url')}")
            print("="*50 + "\n")
            
            # Clean up the task_code.txt after successful generation
            if os.path.exists(task_code_path):
                os.remove(task_code_path)
            break
        elif status in ["fail", "error"]:
            print("Task failed:", data)
            break
            
        time.sleep(10)

if __name__ == "__main__":
    main()