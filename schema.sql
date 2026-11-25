CREATE DATABASE IF NOT EXISTS syschs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE syschs;

CREATE TABLE bills (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	created_at DATETIME NOT NULL, 
	period_start DATETIME NOT NULL, 
	period_end DATETIME NOT NULL, 
	total_acts INTEGER NOT NULL, 
	total_amount NUMERIC(10, 3) NOT NULL, 
	cnss_numbers TEXT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	cnss_reference VARCHAR(50), 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE patients (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	cnss_number VARCHAR(20) NOT NULL, 
	first_name VARCHAR(60) NOT NULL, 
	last_name VARCHAR(60) NOT NULL, 
	address VARCHAR(200) NOT NULL, 
	phone VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (cnss_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rooms (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	number VARCHAR(10) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	username VARCHAR(50) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	`role` VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bill_lines (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	bill_id INTEGER NOT NULL, 
	doctor_id INTEGER NOT NULL, 
	act_count INTEGER NOT NULL, 
	amount NUMERIC(10, 3) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(bill_id) REFERENCES bills (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dossiers (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	patient_id INTEGER NOT NULL, 
	barcode VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (patient_id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	UNIQUE (barcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE consultations (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	patient_id INTEGER NOT NULL, 
	dossier_id INTEGER NOT NULL, 
	registered_by_id INTEGER, 
	nurse_id INTEGER, 
	doctor_id INTEGER, 
	bill_id INTEGER, 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME NOT NULL, 
	prescription_details TEXT, 
	nurse_notes TEXT, 
	nurse_at DATETIME, 
	diagnosis TEXT, 
	decision VARCHAR(20), 
	medication TEXT, 
	act_type VARCHAR(20), 
	closed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(dossier_id) REFERENCES dossiers (id), 
	FOREIGN KEY(registered_by_id) REFERENCES users (id), 
	FOREIGN KEY(nurse_id) REFERENCES users (id), 
	FOREIGN KEY(doctor_id) REFERENCES users (id), 
	FOREIGN KEY(bill_id) REFERENCES bills (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE surgeries (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	consultation_id INTEGER NOT NULL, 
	patient_id INTEGER NOT NULL, 
	room_id INTEGER NOT NULL, 
	label VARCHAR(150) NOT NULL, 
	start DATETIME NOT NULL, 
	end DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(consultation_id) REFERENCES consultations (id), 
	FOREIGN KEY(patient_id) REFERENCES patients (id), 
	FOREIGN KEY(room_id) REFERENCES rooms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
