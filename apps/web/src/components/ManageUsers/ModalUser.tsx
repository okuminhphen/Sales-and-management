// @ts-nocheck
// import Button from "react-bootstrap/Button";
// import Modal from "react-bootstrap/Modal";
// import { useState, useEffect } from "react";
// import "./Users.scss";
// import { fetchGroups, createNewUser } from "../../services/productService";
// import { toast } from "react-toastify";
// import _ from "lodash";
// const ModalUser = (props) => {
//   const [userGroups, setUserGroups] = useState([]);

//   const defaultUserData = {
//     email: "",
//     phone: "",
//     username: "",
//     password: "",
//     address: "",
//     gender: "",
//     group: "",
//   };
//   const defaultValidInput = {
//     email: true,
//     phone: true,
//     username: true,
//     password: true,
//     address: true,
//     gender: true,
//     group: true,
//   };
//   const [userData, setUserData] = useState(defaultUserData);
//   const [validInputs, setValidInputs] = useState(defaultValidInput);
//   useEffect(() => {
//     getGroups();
//   }, []);

//   const getGroups = async () => {
//     let response = await fetchGroups();
//     if (response && +response.data.EC === 0) {
//       setUserGroups(response.data.DT);
//       if (response.data.DT && response.data.DT.length > 0) {
//         let groups = response.data.DT;
//         setUserData({ ...userData, group: groups[0].id });
//       }
//     } else {
//       toast.error(response.data.EM);
//     }
//   };

//   const handleOnchangeInput = (value, nameInput) => {
//     let _userData = _.cloneDeep(userData);
//     _userData[nameInput] = value;
//     setUserData(_userData);
//   };

//   const checkValidateInputs = () => {
//     setValidInputs(defaultValidInput);
//     let inputs = ["email", "phone", "username", "password", "group"];
//     let check = true;
//     for (let item of inputs) {
//       if (!userData[item]) {
//         toast.error(`Empty input: ${item}`);
//         let _validInputs = _.cloneDeep(defaultValidInput);
//         _validInputs[item] = false;
//         setValidInputs(_validInputs);
//         check = false;
//         break; // Dừng vòng lặp ngay khi gặp input trống
//       }
//     }
//     return check;
//   };

//   const handleModalConfirm = async () => {
//     let check = checkValidateInputs();

//     if (check === true) {
//       let res = await createNewUser({
//         ...userData,
//         groupId: userData["group"],
//         sex: userData["gender"],
//       });
//       props.onHide();
//       setUserData({ ...defaultUserData, group: userGroups[0].id });
//       console.log(">>>check data: ", res);
//       // _____________bug ở đây_____________________
//       // if (res.data && res.data.EC === 0) {
//       //   props.onHide();
//       //   setUserData({ ...defaultUserData, group: userGroups[0].id });
//       // } else {
//       //   toast.error(res.data.EM);
//       // }
//     }
//   };
//   return (
//     <>
//       <Modal
//         size="lg"
//         show={props.show}
//         className="modal-user"
//         onHide={props.onHide}
//       >
//         <Modal.Header closeButton>
//           <Modal.Title id="contained-modal-title-vcenter">
//             <span>{props.title}</span>
//           </Modal.Title>
//         </Modal.Header>
//         <Modal.Body>
//           <div className="content-body row">
//             <div className="col-12 col-sm-6 form-group">
//               <label>
//                 Email(<span className="character">*</span>):
//               </label>
//               <input
//                 className={
//                   validInputs.email ? "form-control" : "form-control is-invalid"
//                 }
//                 type="email"
//                 value={userData.email}
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "email")
//                 }
//               />
//             </div>
//             <div className="col-12 col-sm-6 form-group">
//               <label>
//                 Phone number(<span className="character">*</span>):
//               </label>
//               <input
//                 className={
//                   validInputs.phone ? "form-control" : "form-control is-invalid"
//                 }
//                 type="text"
//                 value={userData.phone}
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "phone")
//                 }
//               />
//             </div>
//             <div className="col-12 col-sm-6 form-group">
//               <label>
//                 Username(<span className="character">*</span>):
//               </label>
//               <input
//                 className={
//                   validInputs.username
//                     ? "form-control"
//                     : "form-control is-invalid"
//                 }
//                 type="text"
//                 value={userData.username}
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "username")
//                 }
//               />
//             </div>
//             <div className="col-12 col-sm-6 form-group">
//               <label>
//                 Password (<span className="character">*</span>):
//               </label>
//               <input
//                 className={
//                   validInputs.password
//                     ? "form-control"
//                     : "form-control is-invalid"
//                 }
//                 type="password"
//                 value={userData.password}
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "password")
//                 }
//               />
//             </div>
//             <div className="col-12 form-group">
//               <label>Address:</label>
//               <input
//                 className="form-control"
//                 type="text"
//                 value={userData.address}
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "address")
//                 }
//               />
//             </div>
//             <div className="col-12 col-sm-6 form-group">
//               <label>Gender:</label>
//               <select
//                 className="form-select"
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "gender")
//                 }
//               >
//                 <option defaultValue="Male">Male</option>
//                 <option value="Female">Female</option>
//               </select>
//             </div>
//             <div className="col-12 col-sm-6 form-group">
//               <label>
//                 Group(<span className="character">*</span>):
//               </label>
//               <select
//                 className={
//                   validInputs.group ? "form-select" : "form-select is-invalid"
//                 }
//                 onChange={(event) =>
//                   handleOnchangeInput(event.target.value, "group")
//                 }
//               >
//                 {userGroups &&
//                   userGroups.map((item, index) => {
//                     return (
//                       <option key={`group-${index}`} value={item.id}>
//                         {item.name}
//                       </option>
//                     );
//                   })}
//               </select>
//             </div>
//           </div>
//         </Modal.Body>
//         <Modal.Footer>
//           <Button variant="secondary" onClick={props.onHide}>
//             Close
//           </Button>
//           <Button variant="primary" onClick={handleModalConfirm}>
//             Save
//           </Button>
//         </Modal.Footer>
//       </Modal>
//     </>
//   );
// };
// export default ModalUser;
