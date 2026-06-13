import streamlit as st
import pandas as pd
import os
import subprocess

st.set_page_config(page_title="Infinity Control Plane", layout="wide")
st.title("🌐 Infinity Control Plane")
st.subheader("Manifest Governance & Schema Management")

# File Uploader
uploaded_file = st.file_uploader("Upload Master Manifest", type=['xlsx', 'xls'])

if uploaded_file is not None:
    # Save uploaded file
    save_path = os.path.join("data/manifests", uploaded_file.name)
    with open(save_path, "wb") as f:
        f.write(uploaded_file.getbuffer())
    
    st.success(f"Manifest uploaded: {uploaded_file.name}")

    if st.button("Run Schema Normalization"):
        with st.spinner("Processing Business Rules..."):
            # Trigger your existing script
            result = subprocess.run(['python3', 'scripts/registry_processor.py'], capture_output=True, text=True)
            if result.returncode == 0:
                st.success("Normalization Complete: Business_Rules_Engine_PROD.csv generated.")
                with open("Business_Rules_Engine_PROD.csv", "rb") as f:
                    st.download_button("Download PROD Rules", f, "Business_Rules_Engine_PROD.csv")
            else:
                st.error(f"Error: {result.stderr}")
