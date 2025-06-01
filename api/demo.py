from Google import get_drive_service,create_folder

def main():
    service=get_drive_service()

    folder_id=create_folder(service,"chatbot v2")
    print(folder_id)

if __name__=="__main__":
    main()