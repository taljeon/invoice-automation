// One shared Firebase app avoids duplicate initialization across legacy imports.
export { default, auth, db, storage, IS_DEMO_MODE, requireCloudUser } from '../config/firebase'
